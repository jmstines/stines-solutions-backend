import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getSession, getUserById, getUserByEmail, hashPassword } from './utils/auth';
import { getCorsHeaders } from './utils/cors';
import crypto from 'crypto';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

    // Verify caller is an admin
    const caller = await getUserById(session.userId);
    if (!caller || caller.role !== 'admin') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Forbidden' })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { email, password, role = 'user' } = body;

    if (!email || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Email and password are required' })
      };
    }

    if (role !== 'admin' && role !== 'user') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Role must be admin or user' })
      };
    }

    if (password.length < 8) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Password must be at least 8 characters long' })
      };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already in use
    const existing = await getUserByEmail(normalizedEmail);
    if (existing) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'An account with that email already exists' })
      };
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();

    await docClient.send(new PutCommand({
      TableName: process.env.USERS_TABLE!,
      Item: {
        userId,
        email: normalizedEmail,
        passwordHash,
        role,
        createdAt: Date.now()
      }
    }));

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Account created successfully', userId })
    };

  } catch (error: unknown) {
    console.error('Create user error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
