import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getSession, getUserById } from './utils/auth';
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
    const cookies = event.headers.Cookie || event.headers.cookie || '';
    const sessionId = cookies
      .split(';')
      .find(c => c.trim().startsWith('sessionId='))
      ?.split('=')[1];

    if (!sessionId) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Not authenticated' }) };
    }

    const session = await getSession(sessionId);
    if (!session) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid session' }) };
    }

    const caller = await getUserById(session.userId);
    if (!caller || caller.role !== 'admin') {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const targetUserId = event.pathParameters?.userId;
    if (!targetUserId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'User ID is required' }) };
    }

    if (targetUserId === caller.userId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'You cannot delete your own account' }) };
    }

    const target = await getUserById(targetUserId);
    if (!target) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'User not found' }) };
    }

    await docClient.send(new DeleteCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: targetUserId },
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'User deleted successfully' }),
    };

  } catch (error: unknown) {
    console.error('Delete user error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
