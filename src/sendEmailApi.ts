
import { APIGatewayProxyHandler } from 'aws-lambda';
import AWS from 'aws-sdk';

const ses = new AWS.SES();

export const handler: APIGatewayProxyHandler = async (event) => {
  const normalizeOrigin = (url: string) => url.replace(/^https?:\/\/www\./, 'https://');

  const origin = event.headers.origin || '';
  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigin = normalizedOrigin === process.env.DOMAIN_NAME ? origin : '';

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

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

    if (!name || !email || !message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    const params: AWS.SES.SendEmailRequest = {
      Source: process.env.SOURCE_EMAIL!,
      Destination: {
        ToAddresses: [process.env.DESTINATION_EMAIL!],
      },
      Message: {
        Subject: { Data: `New Contact from ${name}` },
        Body: {
          Text: {
            Data: `Name: ${name}\nEmail: ${email}\nMessage:\n${message}`,
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
