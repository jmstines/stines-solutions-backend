import { APIGatewayProxyHandler } from 'aws-lambda';
import { getUserByEmail, verifyPassword, createSession } from './utils/auth';
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
    const body = JSON.parse(event.body || '{}');
    const { email, password } = body;

    if (!email || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Email and password required' })
      };
    }

    // Find user
    const user = await getUserByEmail(email.toLowerCase());
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    // Create session
    const session = await createSession(user.userId);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Set-Cookie': `sessionId=${session.sessionId}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${24 * 60 * 60}`
      },
      body: JSON.stringify({
        user: {
          userId: user.userId,
          email: user.email,
          role: user.role
        },
        sessionId: session.sessionId
      })
    };

  } catch (error: any) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
