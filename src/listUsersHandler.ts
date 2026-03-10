import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getSession, getUserById } from './utils/auth';
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

    const result = await docClient.send(new ScanCommand({
      TableName: process.env.USERS_TABLE!,
      ProjectionExpression: 'userId, email, #r, createdAt',
      ExpressionAttributeNames: { '#r': 'role' },
    }));

    const users = (result.Items || []).map(item => ({
      userId: item.userId,
      email: item.email,
      role: item.role,
      createdAt: item.createdAt,
    }));

    users.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ users }),
    };

  } catch (error: unknown) {
    console.error('List users error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
