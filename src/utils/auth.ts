import AWS from 'aws-sdk';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const dynamodb = new AWS.DynamoDB.DocumentClient();
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
  
  await dynamodb.put({
    TableName: SESSIONS_TABLE,
    Item: session
  }).promise();
  
  return session;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const result = await dynamodb.get({
    TableName: SESSIONS_TABLE,
    Key: { sessionId }
  }).promise();
  
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
  await dynamodb.delete({
    TableName: SESSIONS_TABLE,
    Key: { sessionId }
  }).promise();
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await dynamodb.query({
    TableName: USERS_TABLE,
    IndexName: 'EmailIndex',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': email
    }
  }).promise();
  
  return result.Items && result.Items.length > 0 ? result.Items[0] as User : null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const result = await dynamodb.get({
    TableName: USERS_TABLE,
    Key: { userId }
  }).promise();
  
  return result.Item ? result.Item as User : null;
}
