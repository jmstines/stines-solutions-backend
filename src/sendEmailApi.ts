import { APIGatewayProxyHandler } from 'aws-lambda';
import AWS from 'aws-sdk';

const ses = new AWS.SES();

// Validation constants
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const handler: APIGatewayProxyHandler = async (event) => {
  // Determine allowed origin for CORS
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  
  // Allowed domains for CORS
  const allowedDomains = [
    'https://stinessolutions.com',
    'https://www.stinessolutions.com',
    'https://api.stinessolutions.com'
  ];
  
  // Check if origin is allowed
  const allowedOrigin = allowedDomains.includes(origin) ? origin : 'https://www.stinessolutions.com';

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'false'
  };

  console.log('Request origin:', origin);
  console.log('CORS Headers:', corsHeaders);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'CORS preflight OK' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, email, message } = body;

    // Validation
    if (!name || !email || !message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Email format validation
    if (!EMAIL_REGEX.test(email)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }

    // Length limits
    if (name.length > MAX_NAME_LENGTH || 
        email.length > MAX_EMAIL_LENGTH || 
        message.length > MAX_MESSAGE_LENGTH) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Input too long' })
      };
    }

    // Sanitize inputs (basic XSS prevention)
    const sanitizedName = name.trim().substring(0, MAX_NAME_LENGTH);
    const sanitizedEmail = email.trim().substring(0, MAX_EMAIL_LENGTH);
    const sanitizedMessage = message.trim().substring(0, MAX_MESSAGE_LENGTH);

    const params: AWS.SES.SendEmailRequest = {
      Source: process.env.SOURCE_EMAIL!,
      Destination: {
        ToAddresses: [process.env.DESTINATION_EMAIL!],
      },
      Message: {
        Subject: { Data: `New Contact from ${sanitizedName}` },
        Body: {
          Text: {
            Data: `Name: ${sanitizedName}\nEmail: ${sanitizedEmail}\nMessage:\n${sanitizedMessage}`,
          },
        },
      },
    };

    await ses.sendEmail(params).promise();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Email sent successfully' })
    };

  } catch (error: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error.message,
        destinationEmail: process.env.DESTINATION_EMAIL,
        sourceEmail: process.env.SOURCE_EMAIL,
      }),
    };
  }
};
