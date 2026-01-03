import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: 'us-east-1' });

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface HuggingFaceResponse {
  generated_text?: string;
  error?: string;
}

let cachedToken: string | null = null;

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
 * Format chat messages for the Hugging Face model
 */
export function formatChatHistory(messages: Message[]): string {
  // Format for Phi-3 / general chat models
  return messages
    .map((msg) => {
      if (msg.role === 'user') {
        return `<|user|>\n${msg.content}<|end|>`;
      } else if (msg.role === 'assistant') {
        return `<|assistant|>\n${msg.content}<|end|>`;
      } else if (msg.role === 'system') {
        return `<|system|>\n${msg.content}<|end|>`;
      }
      return '';
    })
    .join('\n') + '\n<|assistant|>\n';
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
  const token = await getHuggingFaceToken();
  
  const {
    maxTokens = 500,
    temperature = 0.7,
    topP = 0.9,
  } = options;

  // Format the conversation history
  const prompt = formatChatHistory(messages);

  const url = `https://api-inference.huggingface.co/models/${model}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: maxTokens,
          temperature,
          top_p: topP,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hugging Face API error:', response.status, errorText);
      
      // Handle model loading
      if (response.status === 503) {
        throw new Error('Model is loading, please try again in a few seconds');
      }
      
      throw new Error(`Hugging Face API error: ${response.status}`);
    }

    const data: HuggingFaceResponse[] = await response.json();
    
    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text.trim();
    } else if (data[0]?.error) {
      throw new Error(data[0].error);
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
  // Using microsoft/Phi-3-mini-4k-instruct - reliable and fast
  return 'microsoft/Phi-3-mini-4k-instruct';
}
