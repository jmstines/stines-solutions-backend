import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { getSession, getUserById } from './utils/auth';
import { getCorsHeaders } from './utils/cors';
import { callInference, getDefaultModel } from './utils/huggingface';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const CHAT_HISTORY_TABLE = process.env.CHAT_HISTORY_TABLE!;

interface ChatMessage {
  userId: string;
  messageId: string;
  conversationId: string;
  timestamp: number;
  role: 'user' | 'assistant';
  content: string;
  model: string;
  expiresAt: number;
}

interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
}

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
    // Verify authentication
    const cookies = event.headers.Cookie || event.headers.cookie || '';
    const sessionIdMatch = cookies.match(/sessionId=([^;]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    if (!sessionId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Not authenticated' })
      };
    }

    const session = await getSession(sessionId);
    if (!session) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid or expired session' })
      };
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Normalize path (remove stage from path if present)
    const path = event.path || event.resource || '';
    const normalizedPath = path.replace(/^\/[^/]+\//, '/'); // Remove stage prefix if present
    
    console.log('Path:', path, 'Normalized:', normalizedPath, 'Method:', event.httpMethod);

    // Handle different HTTP methods and paths
    if (event.httpMethod === 'POST' && (normalizedPath === '/chat' || path.endsWith('/chat'))) {
      return await handleSendMessage(event, user.userId, corsHeaders);
    } else if (event.httpMethod === 'GET' && (normalizedPath === '/chat/conversations' || path.endsWith('/chat/conversations'))) {
      return await handleGetConversations(user.userId, corsHeaders);
    } else if (event.httpMethod === 'GET' && (normalizedPath.startsWith('/chat/conversations/') || path.includes('/chat/conversations/'))) {
      const conversationId = path.split('/').pop();
      if (!conversationId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Conversation ID required' })
        };
      }
      return await handleGetConversation(conversationId, user.userId, corsHeaders);
    } else if (event.httpMethod === 'DELETE' && (normalizedPath.startsWith('/chat/conversations/') || path.includes('/chat/conversations/'))) {
      const conversationId = path.split('/').pop();
      if (!conversationId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Conversation ID required' })
        };
      }
      return await handleDeleteConversation(conversationId, user.userId, corsHeaders);
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not found' })
    };
  } catch (error) {
    console.error('Error in chat handler:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      })
    };
  }
};

async function handleSendMessage(event: any, userId: string, corsHeaders: any) {
  const body: ChatRequest = JSON.parse(event.body || '{}');
  
  if (!body.message || body.message.trim().length === 0) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Message is required' })
    };
  }

  const conversationId = body.conversationId || uuidv4();
  const model = body.model || getDefaultModel();
  const timestamp = Date.now();
  const expiresAt = Math.floor(timestamp / 1000) + (90 * 24 * 60 * 60); // 90 days

  try {
    // Get conversation history
    const history = await getConversationHistory(conversationId, userId);
    
    // Build messages for AI
    const messages = [
      { role: 'system' as const, content: 'You are a helpful AI assistant.' },
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user' as const, content: body.message }
    ];

    // Save user message
    const userMessage: ChatMessage = {
      userId,
      messageId: uuidv4(),
      conversationId,
      timestamp,
      role: 'user',
      content: body.message,
      model,
      expiresAt
    };

    await docClient.send(new PutCommand({
      TableName: CHAT_HISTORY_TABLE,
      Item: userMessage
    }));

    // Call Hugging Face API
    const aiResponse = await callInference(model, messages, {
      maxTokens: 500,
      temperature: 0.7,
      topP: 0.9
    });

    // Save AI response
    const assistantMessage: ChatMessage = {
      userId,
      messageId: uuidv4(),
      conversationId,
      timestamp: Date.now(),
      role: 'assistant',
      content: aiResponse,
      model,
      expiresAt
    };

    await docClient.send(new PutCommand({
      TableName: CHAT_HISTORY_TABLE,
      Item: assistantMessage
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        conversationId,
        message: aiResponse,
        timestamp: assistantMessage.timestamp
      })
    };
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

async function handleGetConversations(userId: string, corsHeaders: any) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: CHAT_HISTORY_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      ScanIndexForward: false, // Most recent first
      Limit: 100
    }));

    // Group by conversation and get the first message of each
    const conversationMap = new Map<string, any>();
    
    result.Items?.forEach(item => {
      if (!conversationMap.has(item.conversationId)) {
        conversationMap.set(item.conversationId, {
          conversationId: item.conversationId,
          lastMessage: item.content,
          lastTimestamp: item.timestamp,
          preview: item.content.substring(0, 100)
        });
      }
    });

    const conversations = Array.from(conversationMap.values())
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ conversations })
    };
  } catch (error) {
    console.error('Error getting conversations:', error);
    throw error;
  }
}

async function handleGetConversation(conversationId: string, userId: string, corsHeaders: any) {
  try {
    const messages = await getConversationHistory(conversationId, userId);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        conversationId,
        messages 
      })
    };
  } catch (error) {
    console.error('Error getting conversation:', error);
    throw error;
  }
}

async function handleDeleteConversation(conversationId: string, userId: string, corsHeaders: any) {
  try {
    // Get all messages in the conversation
    const messages = await getConversationHistory(conversationId, userId);

    // Delete all messages
    for (const message of messages) {
      await docClient.send(new DeleteCommand({
        TableName: CHAT_HISTORY_TABLE,
        Key: {
          userId,
          messageId: message.messageId
        }
      }));
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        message: 'Conversation deleted successfully',
        deletedCount: messages.length
      })
    };
  } catch (error) {
    console.error('Error deleting conversation:', error);
    throw error;
  }
}

async function getConversationHistory(conversationId: string, userId: string): Promise<ChatMessage[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: CHAT_HISTORY_TABLE,
    IndexName: 'ConversationIndex',
    KeyConditionExpression: 'conversationId = :conversationId',
    ExpressionAttributeValues: {
      ':conversationId': conversationId
    },
    ScanIndexForward: true // Oldest first
  }));

  // Filter by userId to ensure user only sees their own messages
  const messages = (result.Items || [])
    .filter(item => item.userId === userId)
    .map(item => ({
      userId: item.userId,
      messageId: item.messageId,
      conversationId: item.conversationId,
      timestamp: item.timestamp,
      role: item.role,
      content: item.content,
      model: item.model,
      expiresAt: item.expiresAt
    }));

  return messages;
}
