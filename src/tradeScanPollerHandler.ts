import { ScheduledEvent } from 'aws-lambda';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const sqs = new SQSClient({ region: 'us-east-1' });
const lambda = new LambdaClient({ region: 'us-east-1' });

const SCAN_QUEUE_URL = process.env.SCAN_QUEUE_URL!;
const SCANNER_FUNCTION_NAME = process.env.SCANNER_FUNCTION_NAME!;

const BATCH_SIZE = 8;
const INTER_CALL_DELAY_MS = 1000; // 1s apart = max 8 calls/min, within Twelve Data free tier

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const handler = async (_event: ScheduledEvent): Promise<void> => {
  const receiveResult = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: SCAN_QUEUE_URL,
    MaxNumberOfMessages: BATCH_SIZE,
    WaitTimeSeconds: 1,
  }));

  const messages = receiveResult.Messages ?? [];

  if (messages.length === 0) {
    console.log('No messages in queue — scan complete or not yet dispatched');
    return;
  }

  console.log(`Polling batch: invoking scanner for ${messages.length} ticker(s)`);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    try {
      await lambda.send(new InvokeCommand({
        FunctionName: SCANNER_FUNCTION_NAME,
        InvocationType: 'Event', // async — fire and forget
        Payload: Buffer.from(message.Body!),
      }));

      // Only delete from SQS after a successful invocation
      await sqs.send(new DeleteMessageCommand({
        QueueUrl: SCAN_QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle!,
      }));
    } catch (err) {
      // Leave message in queue — it will become visible again after visibility timeout
      // and retry up to maxReceiveCount times before going to the DLQ
      console.error(`Failed to invoke scanner for message: ${err}`);
    }

    // Wait 1s before the next call (skip wait after the last message)
    if (i < messages.length - 1) {
      await sleep(INTER_CALL_DELAY_MS);
    }
  }

  console.log(`Batch complete: ${messages.length} scanner invocation(s) dispatched`);
};
