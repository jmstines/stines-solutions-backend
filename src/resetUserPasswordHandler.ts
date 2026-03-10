import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSession, getUserById, hashPassword } from './utils/auth';
import { getCorsHeaders } from './utils/cors';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

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

    const target = await getUserById(targetUserId);
    if (!target) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'User not found' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { password } = body;

    if (!password) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Password is required' }) };
    }

    if (password.length < 8) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Password must be at least 8 characters long' }) };
    }

    const passwordHash = await hashPassword(password);

    await docClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: targetUserId },
      UpdateExpression: 'SET passwordHash = :hash',
      ExpressionAttributeValues: { ':hash': passwordHash },
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Password reset successfully' }),
    };

  } catch (error: unknown) {
    console.error('Reset password error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
