import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const dynamodb = new DynamoDBClient({ region: 'us-east-1' });

async function createAdminUser(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);

  const user = {
    userId: uuidv4(),
    email: email.toLowerCase(),
    passwordHash,
    role: 'admin',
    createdAt: Date.now(),
  };

  const params = {
    TableName: 'stines-solutions-users',
    Item: marshall(user),
  };

  await dynamodb.send(new PutItemCommand(params));

  console.log('Admin user created successfully!');
  console.log('Email:', email);
  console.log('User ID:', user.userId);
  console.log('\nYou can now log in with these credentials.');
}

// Usage: ts-node create-admin.ts your@email.com yourpassword
const [,, email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: ts-node create-admin.ts <email> <password>');
  process.exit(1);
}

createAdminUser(email, password)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error creating admin user:', error);
    process.exit(1);
  });
