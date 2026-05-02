import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getCorsHeaders } from './utils/cors';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const WATCHLIST_TABLE = process.env.WATCHLIST_TABLE!;

const SYMBOL_REGEX = /^[A-Z]{1,5}$/;

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Admin-only — role is injected by the Lambda authorizer into requestContext
  const role = event.requestContext.authorizer?.role;
  if (role !== 'admin') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Admin access required' }),
    };
  }

  try {
    // GET /watchlist — list all symbols
    if (event.httpMethod === 'GET') {
      const result = await docClient.send(new ScanCommand({ TableName: WATCHLIST_TABLE }));
      const symbols = (result.Items ?? [])
        .map((item) => ({ symbol: item.symbol as string, addedAt: item.addedAt as number }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ symbols }),
      };
    }

    // POST /watchlist — add a symbol
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const symbol: string = (body.symbol || '').toUpperCase().trim();

      if (!SYMBOL_REGEX.test(symbol)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid symbol — must be 1–5 uppercase letters' }),
        };
      }

      await docClient.send(new PutCommand({
        TableName: WATCHLIST_TABLE,
        Item: { symbol, addedAt: Date.now() },
        ConditionExpression: 'attribute_not_exists(symbol)',
      })).catch((err) => {
        if (err.name === 'ConditionalCheckFailedException') return; // already exists — idempotent
        throw err;
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ symbol }),
      };
    }

    // DELETE /watchlist/{symbol} — remove a symbol
    if (event.httpMethod === 'DELETE') {
      const symbol = (event.pathParameters?.symbol || '').toUpperCase().trim();

      if (!SYMBOL_REGEX.test(symbol)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid symbol' }),
        };
      }

      await docClient.send(new DeleteCommand({
        TableName: WATCHLIST_TABLE,
        Key: { symbol },
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ symbol }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Watchlist handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
