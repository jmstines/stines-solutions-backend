import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// CORS helper for dynamic origin handling
const ALLOWED_ORIGINS = [
  'https://www.stinessolutions.com',
  'https://stinessolutions.com',
  'http://localhost:5173',
  'http://localhost:3000'
];

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function getCorsHeaders(origin?: string): Record<string, string> {
  const requestOrigin = origin || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,DELETE,PUT,PATCH',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,Cookie',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
  }

  return headers;
}

/**
 * Returns a 403 response if the Origin header is missing or not in the allowlist
 * for unsafe HTTP methods (POST, PUT, PATCH, DELETE). Returns null for safe methods.
 */
export function assertAllowedOrigin(
  event: Pick<APIGatewayProxyEvent, 'httpMethod' | 'headers'>,
  corsHeaders: Record<string, string>
): APIGatewayProxyResult | null {
  if (!UNSAFE_METHODS.has(event.httpMethod)) return null;

  const origin = event.headers.origin || event.headers.Origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Forbidden' }),
    };
  }
  return null;
}
