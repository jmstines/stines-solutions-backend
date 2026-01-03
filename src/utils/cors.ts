// CORS helper for dynamic origin handling
const ALLOWED_ORIGINS = [
  'https://www.stinessolutions.com',
  'http://localhost:5173',
  'http://localhost:3000'
];

export function getCorsHeaders(origin?: string): Record<string, string> {
  const requestOrigin = origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) 
    ? requestOrigin 
    : ALLOWED_ORIGINS[0]; // Default to production

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true'
  };
}
