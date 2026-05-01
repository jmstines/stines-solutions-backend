import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { getSession, getUserById } from './utils/auth';

export const handler = async (
  event: APIGatewayRequestAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  try {
    const cookieHeader = event.headers?.Cookie ?? event.headers?.cookie ?? '';
    const match = cookieHeader.match(/(?:^|;\s*)sessionId=([^;]+)/);
    const sessionId = match?.[1];

    if (!sessionId) {
      return denyPolicy('anonymous', event.methodArn);
    }

    const session = await getSession(sessionId);
    if (!session) {
      return denyPolicy('anonymous', event.methodArn);
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return denyPolicy('anonymous', event.methodArn);
    }

    // Allow all methods in this stage so the cached policy covers any endpoint
    const stageArn = event.methodArn.split('/').slice(0, 2).join('/') + '/*/*';
    return {
      principalId: user.userId,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: stageArn,
          },
        ],
      },
      context: {
        userId: user.userId,
        role: user.role,
        email: user.email,
      },
    };
  } catch (error) {
    console.error('Authorizer error:', error);
    return denyPolicy('anonymous', event.methodArn);
  }
};

function denyPolicy(principalId: string, resource: string): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Deny',
          Resource: resource,
        },
      ],
    },
  };
}
