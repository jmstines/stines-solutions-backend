import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE!;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;

// Constants
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const SALT_ROUNDS = 10;

export interface User {
  userId: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: number;
}

export interface Session {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string): Promise<Session> {
  const sessionId = generateSessionId();
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION;
  
  const session: Session = {
    sessionId,
    userId,
    createdAt: now,
    expiresAt
  };
  
  await dynamodb.send(new PutCommand({
    TableName: SESSIONS_TABLE,
    Item: session
  }));
  
  return session;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const result = await dynamodb.send(new GetCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionId }
  }));
  
  if (!result.Item) return null;
  
  const session = result.Item as Session;
  
  // Check if expired
  if (session.expiresAt < Date.now()) {
    await deleteSession(sessionId);
    return null;
  }
  
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await dynamodb.send(new DeleteCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionId }
  }));
}

export async function deleteUserSessions(userId: string): Promise<void> {
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamodb.send(new QueryCommand({
      TableName: SESSIONS_TABLE,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ProjectionExpression: 'sessionId',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    const sessions = result.Items || [];
    lastEvaluatedKey = result.LastEvaluatedKey;

    for (let i = 0; i < sessions.length; i += 25) {
      const batch = sessions.slice(i, i + 25);
      await dynamodb.send(new BatchWriteCommand({
        RequestItems: {
          [SESSIONS_TABLE]: batch.map(s => ({
            DeleteRequest: { Key: { sessionId: s.sessionId } }
          }))
        }
      }));
    }
  } while (lastEvaluatedKey);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await dynamodb.send(new QueryCommand({
    TableName: USERS_TABLE,
    IndexName: 'EmailIndex',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email }
  }));
  
  return result.Items && result.Items.length > 0 ? result.Items[0] as User : null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const result = await dynamodb.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId }
  }));
  
  return result.Item ? result.Item as User : null;
}
