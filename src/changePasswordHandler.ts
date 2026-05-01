import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSession, getUserById, verifyPassword, hashPassword, deleteUserSessions } from './utils/auth';
import { getCorsHeaders, assertAllowedOrigin } from './utils/cors';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const originError = assertAllowedOrigin(event, corsHeaders);
  if (originError) return originError;

  try {
    // Get session from cookie
    const cookies = event.headers.Cookie || event.headers.cookie || '';
    const sessionId = cookies
      .split(';')
      .find(c => c.trim().startsWith('sessionId='))
      ?.split('=')[1];

    if (!sessionId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Not authenticated' })
      };
    }

    // Verify session
    const session = await getSession(sessionId);
    if (!session) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid session' })
      };
    }

    // Get user
    const user = await getUserById(session.userId);
    if (!user) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Current password and new password are required' })
      };
    }

    if (newPassword.length < 8) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Password must be at least 8 characters long' })
      };
    }

    // Verify current password
    const validPassword = await verifyPassword(currentPassword, user.passwordHash);
    if (!validPassword) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Current password is incorrect' })
      };
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and revoke all sessions
    await docClient.send(new UpdateCommand({
      TableName: 'stines-solutions-users',
      Key: { userId: user.userId },
      UpdateExpression: 'SET passwordHash = :newPasswordHash',
      ExpressionAttributeValues: { ':newPasswordHash': newPasswordHash }
    }));

    await deleteUserSessions(user.userId);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Set-Cookie': 'sessionId=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0'
      },
      body: JSON.stringify({ message: 'Password changed successfully. Please log in again.' })
    };

  } catch (error: any) {
    console.error('Change password error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
