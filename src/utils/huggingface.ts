import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { HfInference } from '@huggingface/inference';

const ssmClient = new SSMClient({ region: 'us-east-1' });

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

let cachedToken: string | null = null;
let cachedClient: HfInference | null = null;

/**
 * Get Hugging Face API token from AWS SSM Parameter Store
 */
export async function getHuggingFaceToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }

  try {
    const command = new GetParameterCommand({
      Name: '/stines-solutions/huggingface/api-token',
      WithDecryption: true,
    });

    const response = await ssmClient.send(command);
    
    if (!response.Parameter?.Value) {
      throw new Error('Hugging Face API token not found in Parameter Store');
    }

    cachedToken = response.Parameter.Value;
    return cachedToken;
  } catch (error) {
    console.error('Error fetching Hugging Face token:', error);
    throw new Error('Failed to retrieve Hugging Face API token');
  }
}

/**
 * Get Hugging Face client
 */
async function getHfClient(): Promise<HfInference> {
  if (cachedClient) {
    return cachedClient;
  }

  const token = await getHuggingFaceToken();
  cachedClient = new HfInference(token);
  return cachedClient;
}

/**
 * Format chat messages for the Hugging Face model
 */
export function formatChatHistory(messages: Message[]): string {
  // Simple format that works with most instruction-tuned models
  let prompt = '';
  for (const msg of messages) {
    if (msg.role === 'system') {
      prompt += `System: ${msg.content}\n\n`;
    } else if (msg.role === 'user') {
      prompt += `User: ${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      prompt += `Assistant: ${msg.content}\n\n`;
    }
  }
  prompt += 'Assistant: ';
  return prompt;
}

/**
 * Call Hugging Face Inference API
 */
export async function callInference(
  model: string,
  messages: Message[],
  options: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  } = {}
): Promise<string> {
  const client = await getHfClient();
  
  const {
    maxTokens = 500,
    temperature = 0.7,
    topP = 0.9,
  } = options;

  // Format the conversation history
  const prompt = formatChatHistory(messages);
  
  try {
    const response = await client.textGeneration({
      model,
      inputs: prompt,
      parameters: {
        max_new_tokens: maxTokens,
        temperature,
        top_p: topP,
        return_full_text: false,
      },
    });

    if (response.generated_text) {
      return response.generated_text.trim();
    }
    
    throw new Error('Unexpected response format from Hugging Face API');
  } catch (error) {
    console.error('Error calling Hugging Face API:', error);
    
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error('Failed to generate response from AI model');
  }
}

/**
 * Get recommended model name
 */
export function getDefaultModel(): string {
  // Using HuggingFaceH4/zephyr-7b-beta - reliable instruction-tuned model
  return 'HuggingFaceH4/zephyr-7b-beta';
}
