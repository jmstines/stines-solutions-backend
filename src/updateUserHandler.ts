import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSession, getUserById, getUserByEmail } from './utils/auth';
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

    const target = await getUserById(targetUserId);
    if (!target) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'User not found' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { email, role } = body;

    if (!email && !role) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'At least one field (email, role) is required' }) };
    }

    if (role && role !== 'admin' && role !== 'user') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Role must be admin or user' }) };
    }

    const updateParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, string> = {};

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const existing = await getUserByEmail(normalizedEmail);
      if (existing && existing.userId !== targetUserId) {
        return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: 'Email is already in use' }) };
      }
      updateParts.push('#email = :email');
      expressionAttributeNames['#email'] = 'email';
      expressionAttributeValues[':email'] = normalizedEmail;
    }

    if (role) {
      updateParts.push('#role = :role');
      expressionAttributeNames['#role'] = 'role';
      expressionAttributeValues[':role'] = role;
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: targetUserId },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'User updated successfully' }),
    };

  } catch (error: unknown) {
    console.error('Update user error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
