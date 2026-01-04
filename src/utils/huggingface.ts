import Groq from 'groq-sdk';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

let cachedClient: Groq | null = null;

/**
 * Get Groq client
 */
function getGroqClient(): Groq {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is not set');
  }

  cachedClient = new Groq({ apiKey });
  return cachedClient;
}

/**
 * Call Groq Inference API
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
  const client = getGroqClient();
  
  const {
    maxTokens = 200,
    temperature = 0.7,
    topP = 0.9,
  } = options;

  try {  
    const response = await client.chat.completions.create({
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
    });

    if (response.choices && response.choices.length > 0) {
      const message = response.choices[0].message;
      return message.content?.trim() || '';
    }
    
    throw new Error('Unexpected response format from Groq API');
  } catch (error) {
    console.error('Error calling Groq API:', error);
    
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
  // Using Llama 3.1 70B for better code understanding
  return 'llama-3.1-70b-versatile';
}
