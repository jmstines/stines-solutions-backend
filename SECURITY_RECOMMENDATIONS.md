# Backend Security Recommendations

## Status
- ✅ **Implemented**: Input validation (email format, length limits)
- ✅ **Implemented**: Input sanitization
- ✅ **Implemented**: CORS configuration
- ⚠️ **Pending**: Items below

## High Priority

### 1. Add Bot Protection (reCAPTCHA)
**Risk**: Spam submissions, bot attacks
**Impact**: High - Could result in email quota exhaustion or spam

**Implementation**:
1. Add Google reCAPTCHA v3 to frontend form
2. Verify token in Lambda before processing

```typescript
async function verifyRecaptcha(token: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY!;
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secretKey}&response=${token}`
  });
  
  const data = await response.json();
  return data.success && data.score > 0.5; // Adjust threshold as needed
}

export const handler: APIGatewayProxyHandler = async (event) => {
  // ... CORS headers ...
  
  const body = JSON.parse(event.body || '{}');
  const { name, email, message, recaptchaToken } = body;
  
  // Verify reCAPTCHA
  if (!recaptchaToken || !(await verifyRecaptcha(recaptchaToken))) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid captcha' })
    };
  }
  
  // ... rest of validation and email sending ...
}
```

**Estimated Cost**: Free (up to 1M assessments/month)

### 2. Rate Limiting per Email
**Risk**: Single user could spam by changing IPs
**Impact**: Medium - Could exhaust email quota

Use DynamoDB to track submissions:
```typescript
const dynamodb = new AWS.DynamoDB.DocumentClient();

async function checkRateLimit(email: string): Promise<boolean> {
  const tableName = process.env.RATE_LIMIT_TABLE!;
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  const result = await dynamodb.query({
    TableName: tableName,
    KeyConditionExpression: 'email = :email AND #timestamp > :timeLimit',
    ExpressionAttributeNames: { '#timestamp': 'timestamp' },
    ExpressionAttributeValues: {
      ':email': email,
      ':timeLimit': oneHourAgo
    }
  }).promise();
  
  return (result.Count || 0) < 3; // Max 3 submissions per hour
}
```

**Estimated Cost**: ~$0.25/month (DynamoDB on-demand)

### 3. Email Content Filtering
**Risk**: Malicious content, phishing attempts
**Impact**: Medium - Could harm reputation

Add content filtering:
```typescript
function containsSuspiciousContent(text: string): boolean {
  const suspiciousPatterns = [
    /\b(viagra|cialis|casino|lottery|winner)\b/gi,
    /\b\d{16}\b/, // Credit card patterns
    /<script/gi,  // Script tags
    /javascript:/gi,
    /onclick=/gi
  ];
  
  return suspiciousPatterns.some(pattern => pattern.test(text));
}

// In handler
if (containsSuspiciousContent(sanitizedMessage) || 
    containsSuspiciousContent(sanitizedName)) {
  console.warn('Suspicious content detected', { email: sanitizedEmail });
  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'Invalid content detected' })
  };
}
```

## Medium Priority

### 4. Enhanced Logging and Monitoring
**Current**: Basic console.log statements
**Improvement**: Structured logging with CloudWatch Insights

```typescript
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, any>;
}

function log(level: string, message: string, metadata?: Record<string, any>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata
  };
  console.log(JSON.stringify(entry));
}

// Usage
log('INFO', 'Contact form submitted', { 
  email: sanitizedEmail, 
  nameLength: sanitizedName.length,
  messageLength: sanitizedMessage.length 
});
```

### 5. Dead Letter Queue (DLQ)
**Risk**: Failed email sends are lost
**Impact**: Low - User doesn't know if submission succeeded

Add SQS DLQ to Lambda (in infrastructure):
```terraform
resource "aws_sqs_queue" "lambda_dlq" {
  name = "contact-lambda-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_lambda_function" "contact_lambda" {
  # ... existing config ...
  
  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }
}
```

### 6. SES Bounce/Complaint Handling
**Current**: No tracking of bounces or complaints
**Improvement**: SNS notifications for delivery issues

## Low Priority

### 7. Environment Variable Encryption
Encrypt Lambda environment variables with KMS.

### 8. VPC Configuration
Run Lambda in VPC if you need to access private resources (not needed for SES).

## Dependencies Updates
- Regularly update `aws-sdk` and other dependencies for security patches
- Use `npm audit` to check for vulnerabilities
- Consider using Dependabot for automated updates

## Testing
Add security-focused tests:
```typescript
describe('Input Validation', () => {
  test('rejects invalid email formats', async () => {
    // Test various invalid emails
  });
  
  test('rejects oversized inputs', async () => {
    // Test length limits
  });
  
  test('sanitizes XSS attempts', async () => {
    // Test script injection
  });
});
```

## Review Schedule
- Review quarterly or after any security incident
- Update dependencies monthly
- Last updated: January 2, 2026
