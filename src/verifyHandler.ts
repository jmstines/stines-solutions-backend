import { APIGatewayProxyHandler } from 'aws-lambda';
import { getSession, getUserById } from './utils/auth';
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
    // Get sessionId from cookie or header
    const cookies = event.headers.Cookie || event.headers.cookie || '';
    const sessionIdMatch = cookies.match(/sessionId=([^;]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    if (!sessionId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Not authenticated' })
      };
    }

    const session = await getSession(sessionId);
    if (!session) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid or expired session' })
      };
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        user: {
          userId: user.userId,
          email: user.email,
          role: user.role
        }
      })
    };

  } catch (error: any) {
    console.error('Verify error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
