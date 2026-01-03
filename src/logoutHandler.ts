import { APIGatewayProxyHandler } from 'aws-lambda';
import { deleteSession } from './utils/auth';
import { getCorsHeaders } from './utils/cors';

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const cookies = event.headers.Cookie || event.headers.cookie || '';
    const sessionIdMatch = cookies.match(/sessionId=([^;]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    if (sessionId) {
      await deleteSession(sessionId);
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Set-Cookie': 'sessionId=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
      },
      body: JSON.stringify({ message: 'Logged out successfully' })
    };

  } catch (error: any) {
    console.error('Logout error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
