import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getSession } from './utils/auth';
import { getCorsHeaders } from './utils/cors';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TRADE_SIGNALS_TABLE = process.env.TRADE_SIGNALS_TABLE!;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;

/** Returns the current market date as YYYY-MM-DD in Eastern Time, or a validated override */
function resolveMarketDate(dateParam?: string): string {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return dateParam;
  }
  const etDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = etDate.getFullYear();
  const m = String(etDate.getMonth() + 1).padStart(2, '0');
  const d = String(etDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns YYYY-MM-DD for a date N days before the given date string */
function subtractDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    // Require authentication
    const cookies = event.headers.Cookie || event.headers.cookie || '';
    const sessionIdMatch = cookies.match(/sessionId=([^;]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    if (!sessionId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Not authenticated' }),
      };
    }

    const session = await getSession(sessionId);
    if (!session) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid or expired session' }),
      };
    }

    const requestedDate = resolveMarketDate(event.queryStringParameters?.date);

    // If a specific date was requested, query only that date. Otherwise fall back
    // through the last 7 days to find the most recent scan with data.
    const dateExplicitlyRequested = !!event.queryStringParameters?.date;
    const datesToTry = dateExplicitlyRequested
      ? [requestedDate]
      : Array.from({ length: 7 }, (_, i) => subtractDays(requestedDate, i));

    let items: Record<string, unknown>[] = [];
    let resolvedDate = requestedDate;

    for (const candidateDate of datesToTry) {
      const result = await docClient.send(new QueryCommand({
        TableName: TRADE_SIGNALS_TABLE,
        KeyConditionExpression: 'marketDate = :date',
        ExpressionAttributeValues: { ':date': candidateDate },
      }));
      if (result.Items && result.Items.length > 0) {
        items = result.Items as Record<string, unknown>[];
        resolvedDate = candidateDate;
        break;
      }
    }

    const meta = items.find(item => item.symbol === '_META_');
    const signals = items
      .filter(item => item.symbol !== '_META_')
      .sort((a, b) => (a.symbol as string).localeCompare(b.symbol as string));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        marketDate: resolvedDate,
        scanStatus: meta?.scanStatus ?? 'no_data',
        scannedAt: meta?.scannedAt ?? null,
        totalTickers: meta?.totalTickers ?? 0,
        completedTickers: meta?.completedTickers ?? 0,
        signals,
      }),
    };
  } catch (error) {
    console.error('Error in trade signals handler:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
