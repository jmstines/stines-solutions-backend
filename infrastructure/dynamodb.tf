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

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    projection_type = "ALL"
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

# Chat history table
resource "aws_dynamodb_table" "chat_history" {
  name         = "stines-solutions-chat-history"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "messageId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "messageId"
    type = "S"
  }

  attribute {
    name = "conversationId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  global_secondary_index {
    name            = "ConversationIndex"
    hash_key        = "conversationId"
    range_key       = "timestamp"
    projection_type = "ALL"
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

output "chat_history_table_name" {
  value = aws_dynamodb_table.chat_history.name
}

# ===== Trade Signals Table =====
# PK: marketDate (YYYY-MM-DD), SK: symbol (ticker or "_META_" for scan metadata)
resource "aws_dynamodb_table" "trade_signals" {
  name         = "stines-solutions-trade-signals"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "marketDate"
  range_key    = "symbol"

  attribute {
    name = "marketDate"
    type = "S"
  }

  attribute {
    name = "symbol"
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

output "trade_signals_table_name" {
  value = aws_dynamodb_table.trade_signals.name
}

# ===== Watchlist Table =====
# PK: symbol (ticker e.g. "AAPL"). Stores the scanner watchlist managed via UI.
resource "aws_dynamodb_table" "watchlist" {
  name         = "stines-solutions-watchlist"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "symbol"

  attribute {
    name = "symbol"
    type = "S"
  }

  tags = {
    Project     = "stines-solutions"
    Environment = "production"
  }
}

output "watchlist_table_name" {
  value = aws_dynamodb_table.watchlist.name
}

# ===== Stock Symbols Cache Table =====
# Single-item cache: PK="SYMBOLS", stores full symbol list from Twelve Data.
# Refreshed weekly by EventBridge + on-demand via admin API.
resource "aws_dynamodb_table" "stock_symbols_cache" {
  name         = "stines-solutions-stock-symbols-cache"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "cacheKey"

  attribute {
    name = "cacheKey"
    type = "S"
  }

  tags = {
    Project     = "stines-solutions"
    Environment = "production"
  }
}

output "stock_symbols_cache_table_name" {
  value = aws_dynamodb_table.stock_symbols_cache.name
}
