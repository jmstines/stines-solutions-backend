import { APIGatewayProxyEvent, APIGatewayProxyResult, ScheduledEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import https from 'https';
import { getCorsHeaders } from './utils/cors';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const STOCK_SYMBOLS_TABLE = process.env.STOCK_SYMBOLS_TABLE!;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY!;
const CACHE_KEY = 'SYMBOLS';

export interface StockSymbol {
  symbol: string;
  name: string;
  exchange: string;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchAndCacheSymbols(): Promise<number> {
  // Fetch NYSE and NASDAQ common stocks from Twelve Data reference endpoint (no credit cost)
  const exchanges = ['NYSE', 'NASDAQ'];
  const allSymbols: StockSymbol[] = [];
  const seen = new Set<string>();

  for (const exchange of exchanges) {
    const url = `https://api.twelvedata.com/stocks?exchange=${exchange}&type=Common+Stock&apikey=${TWELVE_DATA_API_KEY}`;
    const raw = await httpsGet(url);
    const json = JSON.parse(raw);

    if (json.status === 'error') {
      throw new Error(`Twelve Data error fetching ${exchange} stocks: ${json.message}`);
    }

    const data: Array<{ symbol: string; name: string; exchange: string }> = json.data ?? [];
    for (const item of data) {
      if (!seen.has(item.symbol) && item.symbol && item.name) {
        seen.add(item.symbol);
        allSymbols.push({
          symbol: item.symbol,
          name: item.name,
          exchange: item.exchange,
        });
      }
    }
  }

  // Sort alphabetically by symbol
  allSymbols.sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Overwrite the single cache item — replaces entire list, no duplicates
  await docClient.send(new PutCommand({
    TableName: STOCK_SYMBOLS_TABLE,
    Item: {
      cacheKey: CACHE_KEY,
      symbols: allSymbols,
      lastUpdated: Date.now(),
      count: allSymbols.length,
    },
  }));

  console.log(`Stock symbols cache refreshed: ${allSymbols.length} symbols stored`);
  return allSymbols.length;
}

/** EventBridge scheduled trigger — refresh cache weekly */
async function handleScheduled(): Promise<void> {
  await fetchAndCacheSymbols();
}

/** API Gateway trigger — GET returns cache, POST /refresh triggers update */
async function handleApiGateway(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    // GET /stock-symbols — return cached list
    if (event.httpMethod === 'GET') {
      const result = await docClient.send(new GetCommand({
        TableName: STOCK_SYMBOLS_TABLE,
        Key: { cacheKey: CACHE_KEY },
      }));

      if (!result.Item) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ symbols: [], lastUpdated: null, count: 0 }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          symbols: result.Item.symbols,
          lastUpdated: result.Item.lastUpdated,
          count: result.Item.count,
        }),
      };
    }

    // POST /stock-symbols/refresh — admin only
    if (event.httpMethod === 'POST') {
      const role = event.requestContext.authorizer?.role;
      if (role !== 'admin') {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Admin access required' }),
        };
      }

      const count = await fetchAndCacheSymbols();
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: `Symbol list updated`, count }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Stock symbols handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

export const handler = async (
  event: APIGatewayProxyEvent | ScheduledEvent
): Promise<APIGatewayProxyResult | void> => {
  if ('source' in event && event.source === 'aws.events') {
    return handleScheduled();
  }
  return handleApiGateway(event as APIGatewayProxyEvent);
};
