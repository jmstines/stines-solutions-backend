import { APIGatewayProxyHandler } from 'aws-lambda';
import { getUserByEmail, verifyPassword, createSession } from './utils/auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.stinessolutions.com',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true'
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, password } = body;

    if (!email || !password) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Email and password required' })
      };
    }

    // Find user
    const user = await getUserByEmail(email.toLowerCase());
    if (!user) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    // Create session
    const session = await createSession(user.userId);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Set-Cookie': `sessionId=${session.sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${24 * 60 * 60}`
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
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
