import { APIGatewayProxyEvent, APIGatewayProxyResult, ScheduledEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const sqs = new SQSClient({ region: 'us-east-1' });

const TRADE_SIGNALS_TABLE = process.env.TRADE_SIGNALS_TABLE!;
const WATCHLIST_TABLE = process.env.WATCHLIST_TABLE!;
const SCAN_QUEUE_URL = process.env.SCAN_QUEUE_URL!;
// 8 seconds between worker invocations respects Twelve Data free-tier (8 calls/min)
const RATE_LIMIT_DELAY_S = 8;
// SQS max delay per message is 900 seconds (~112 tickers). Beyond that we'd need batching.
const SQS_MAX_DELAY_S = 900;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
};

/** Get the current market date as YYYY-MM-DD in Eastern Time */
function getMarketDate(): string {
  const etDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = etDate.getFullYear();
  const m = String(etDate.getMonth() + 1).padStart(2, '0');
  const d = String(etDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isWeekday(): boolean {
  const etDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etDate.getDay();
  return day >= 1 && day <= 5;
}

async function loadWatchlist(): Promise<string[]> {
  const result = await dynamo.send(new ScanCommand({ TableName: WATCHLIST_TABLE }));
  return (result.Items ?? []).map((item) => item.symbol as string).sort();
}

async function dispatch(skipWeekdayCheck = false): Promise<{ scanRunId: string; totalTickers: number }> {
  const marketDate = getMarketDate();
  const scanRunId = randomUUID();
  const watchlist = await loadWatchlist();

  if (watchlist.length === 0) {
    throw new Error('Watchlist is empty');
  }

  // Write _META_ record immediately so the frontend shows "processing"
  await dynamo.send(new PutCommand({
    TableName: TRADE_SIGNALS_TABLE,
    Item: {
      marketDate,
      symbol: '_META_',
      scanRunId,
      scannedAt: Date.now(),
      scanStatus: 'processing',
      totalTickers: watchlist.length,
      completedTickers: 0,
    },
  }));

  // Enqueue one message per ticker with staggered delays for rate limiting
  for (let i = 0; i < watchlist.length; i++) {
    const delaySeconds = Math.min(i * RATE_LIMIT_DELAY_S, SQS_MAX_DELAY_S);
    await sqs.send(new SendMessageCommand({
      QueueUrl: SCAN_QUEUE_URL,
      MessageBody: JSON.stringify({
        symbol: watchlist[i],
        marketDate,
        scanRunId,
        tickerIndex: i,
        totalTickers: watchlist.length,
      }),
      DelaySeconds: delaySeconds,
    }));
  }

  console.log(`Dispatched ${watchlist.length} scan jobs for ${marketDate} runId=${scanRunId}`);
  return { scanRunId, totalTickers: watchlist.length };
}

/** Single handler for both EventBridge (scheduled) and API Gateway (POST /trade-scan/run) */
export const handler = async (
  event: APIGatewayProxyEvent | ScheduledEvent
): Promise<APIGatewayProxyResult | void> => {
  // EventBridge scheduled event has a "source" field; API Gateway events have "httpMethod"
  const isScheduled = 'source' in event && !('httpMethod' in event);

  if (isScheduled) {
    if (!isWeekday()) {
      console.log('Weekend — skipping trade scan dispatch');
      return;
    }
    await dispatch();
    return;
  }

  const apiEvent = event as APIGatewayProxyEvent;

  if (apiEvent.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: '',
    };
  }

  const role = apiEvent.requestContext.authorizer?.role;
  if (role !== 'admin') {
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Admin access required' }),
    };
  }

  try {
    const result = await dispatch(true);
    return {
      statusCode: 202,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: `Scan dispatched for ${result.totalTickers} tickers`,
        scanRunId: result.scanRunId,
        totalTickers: result.totalTickers,
      }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Dispatch error:', msg);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: msg }),
    };
  }
};
