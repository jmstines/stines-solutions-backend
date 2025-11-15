import { APIGatewayProxyHandler } from "aws-lambda";
import AWS from "aws-sdk";

const ses = new AWS.SES({ region: "us-east-1" });

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    const params: AWS.SES.SendEmailRequest = {
      Source: process.env.SOURCE_EMAIL || "verified-source@example.com", // Verified in SES
      Destination: {
        ToAddresses: [process.env.DESTINATION_EMAIL || "jmstines00@example.com"], // Verified if SES sandbox
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
      body: JSON.stringify({ message: "Email sent successfully" }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};