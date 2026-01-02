# DynamoDB Tables for Authentication

# Users table
resource "aws_dynamodb_table" "users" {
  name           = "stines-solutions-users"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  
  attribute {
    name = "userId"
    type = "S"
  }
  
  attribute {
    name = "email"
    type = "S"
  }
  
  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "email"
    projection_type = "ALL"
  }
  
  tags = {
    Project     = "stines-solutions"
    Environment = "production"
  }
}

# Sessions table with TTL for auto-cleanup
resource "aws_dynamodb_table" "sessions" {
  name           = "stines-solutions-sessions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "sessionId"
  
  attribute {
    name = "sessionId"
    type = "S"
  }
  
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  
  tags = {
    Project     = "stines-solutions"
    Environment = "production"
  }
}

# Output table names for Lambda environment variables
output "users_table_name" {
  value = aws_dynamodb_table.users.name
}

output "sessions_table_name" {
  value = aws_dynamodb_table.sessions.name
}
