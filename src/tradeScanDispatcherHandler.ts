import { APIGatewayProxyEvent, APIGatewayProxyResult, ScheduledEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
import { getCorsHeaders, assertAllowedOrigin } from './utils/cors';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const sqs = new SQSClient({ region: 'us-east-1' });

const TRADE_SIGNALS_TABLE = process.env.TRADE_SIGNALS_TABLE!;
const WATCHLIST_TABLE = process.env.WATCHLIST_TABLE!;
const SCAN_QUEUE_URL = process.env.SCAN_QUEUE_URL!;
const DAILY_API_LIMIT = parseInt(process.env.DAILY_API_LIMIT ?? '800', 10);

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
  const symbols = (result.Items ?? []).map((item) => item.symbol as string);
  // Deduplicate and sort
  return [...new Set(symbols)].sort();
}

/**
 * Check and reserve daily API budget.
 * Returns the number of tickers approved — may be less than requested if budget is tight.
 * Throws if the daily limit is already exhausted.
 */
async function reserveDailyBudget(marketDate: string, requested: number): Promise<number> {
  const budgetKey = { marketDate, symbol: '_DAILY_BUDGET_' };

  // Read current usage
  const existing = await dynamo.send(new GetCommand({
    TableName: TRADE_SIGNALS_TABLE,
    Key: budgetKey,
  }));
  const usedToday: number = (existing.Item?.usedToday as number) ?? 0;
  const remaining = DAILY_API_LIMIT - usedToday;

  if (remaining <= 0) {
    throw new Error(`Daily API limit of ${DAILY_API_LIMIT} calls already reached for ${marketDate}`);
  }

  const approved = Math.min(requested, remaining);

  // Atomically reserve the approved count; condition guards against concurrent dispatches
  const ttlSeconds = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60; // 2-day TTL (budget resets daily)
  await dynamo.send(new UpdateCommand({
    TableName: TRADE_SIGNALS_TABLE,
    Key: budgetKey,
    UpdateExpression: 'ADD usedToday :count SET expiresAt = if_not_exists(expiresAt, :ttl)',
    ConditionExpression: 'attribute_not_exists(usedToday) OR usedToday <= :maxAllowed',
    ExpressionAttributeValues: {
      ':count': approved,
      ':maxAllowed': DAILY_API_LIMIT - approved,
      ':ttl': ttlSeconds,
    },
  }));

  if (approved < requested) {
    console.warn(`Daily budget limited scan to ${approved}/${requested} tickers (${usedToday} already used today)`);
  }

  return approved;
}

/** Returns the set of symbols already scanned for the given market date. */
async function loadAlreadyScanned(marketDate: string): Promise<Set<string>> {
  const SPECIAL = new Set(['_META_', '_DAILY_BUDGET_']);
  const scanned = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: TRADE_SIGNALS_TABLE,
      KeyConditionExpression: 'marketDate = :date',
      ExpressionAttributeValues: { ':date': marketDate },
      ProjectionExpression: 'symbol',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      const sym = item.symbol as string;
      if (!SPECIAL.has(sym)) scanned.add(sym);
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return scanned;
}

async function dispatch(skipWeekdayCheck = false): Promise<{ scanRunId: string; totalTickers: number; approvedTickers: number; skippedTickers: number }> {
  const marketDate = getMarketDate();
  const scanRunId = randomUUID();
  const watchlist = await loadWatchlist();

  if (watchlist.length === 0) {
    throw new Error('Watchlist is empty');
  }

  // Skip symbols already scanned today
  const alreadyScanned = await loadAlreadyScanned(marketDate);
  const pending = watchlist.filter((s) => !alreadyScanned.has(s));
  const skippedCount = watchlist.length - pending.length;

  if (pending.length === 0) {
    throw new Error(`All ${watchlist.length} watchlist symbols already scanned for ${marketDate}`);
  }

  if (skippedCount > 0) {
    console.log(`Skipping ${skippedCount} already-scanned symbols; ${pending.length} remaining`);
  }

  // Reserve daily budget — trims list if approaching the limit
  const approvedCount = await reserveDailyBudget(marketDate, pending.length);
  const tickersToScan = pending.slice(0, approvedCount);

  // Write _META_ record immediately so the frontend shows "processing"
  const ttlSeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30-day retention
  await dynamo.send(new PutCommand({
    TableName: TRADE_SIGNALS_TABLE,
    Item: {
      marketDate,
      symbol: '_META_',
      scanRunId,
      scannedAt: Date.now(),
      scanStatus: 'processing',
      totalTickers: tickersToScan.length,
      completedTickers: 0,
      expiresAt: ttlSeconds,
    },
  }));

  // Enqueue one message per ticker — no delay, rate limiting handled by the poller Lambda
  for (let i = 0; i < tickersToScan.length; i++) {
    await sqs.send(new SendMessageCommand({
      QueueUrl: SCAN_QUEUE_URL,
      MessageBody: JSON.stringify({
        symbol: tickersToScan[i],
        marketDate,
        scanRunId,
        tickerIndex: i,
        totalTickers: tickersToScan.length,
      }),
    }));
  }

  console.log(`Dispatched ${tickersToScan.length} scan jobs for ${marketDate} runId=${scanRunId}`);
  return { scanRunId, totalTickers: watchlist.length, approvedTickers: tickersToScan.length, skippedTickers: skippedCount };
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
  const origin = apiEvent.headers.origin || apiEvent.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);

  if (apiEvent.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const originBlock = assertAllowedOrigin(apiEvent, corsHeaders);
  if (originBlock) return originBlock;

  const role = apiEvent.requestContext.authorizer?.role;
  if (role !== 'admin') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Admin access required' }),
    };
  }

  try {
    const result = await dispatch(true);
    const pending = result.totalTickers - result.skippedTickers;
    const budgetTrimmed = result.approvedTickers < pending;
    const message = [
      `Scan dispatched for ${result.approvedTickers} tickers`,
      result.skippedTickers > 0 ? `(${result.skippedTickers} already scanned today, skipped)` : null,
      budgetTrimmed ? `(daily budget limited to ${result.approvedTickers} of ${pending} remaining)` : null,
    ].filter(Boolean).join(' ');
    return {
      statusCode: 202,
      headers: corsHeaders,
      body: JSON.stringify({
        message,
        scanRunId: result.scanRunId,
        totalTickers: result.approvedTickers,
      }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Dispatch error:', msg);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: msg }),
    };
  }
};
