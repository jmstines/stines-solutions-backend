terraform {
  backend "s3" {
    bucket         = "stines-solutions-state-bucket"
    key            = "backend/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "terraform_remote_state" "infrastructure" {
  backend = "s3"

  config = {
    bucket = "stines-solutions-state-bucket"
    key    = "infrastructure/terraform.tfstate"
    region = "us-east-1"
  }
}

data "aws_s3_object" "lambda_zip" {
  bucket = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  key    = var.lambda_code_s3_key
}

resource "aws_iam_role" "lambda_role" {
  name = "contact-form-lambda-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ===== Per-Function IAM Roles (Batch 1) =====

locals {
  lambda_assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# ----- Authorizer Lambda Role -----
resource "aws_iam_role" "authorizer_lambda_role" {
  name               = "authorizer-lambda-role"
  assume_role_policy = local.lambda_assume_role_policy
}

resource "aws_iam_role_policy_attachment" "authorizer_lambda_basic" {
  role       = aws_iam_role.authorizer_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "authorizer_lambda_policy" {
  name = "authorizer-lambda-policy"
  role = aws_iam_role.authorizer_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem"]
      Resource = [
        aws_dynamodb_table.sessions.arn,
        aws_dynamodb_table.users.arn,
      ]
    }]
  })
}

# ----- Verify Lambda Role -----
resource "aws_iam_role" "verify_lambda_role" {
  name               = "verify-lambda-role"
  assume_role_policy = local.lambda_assume_role_policy
}

resource "aws_iam_role_policy_attachment" "verify_lambda_basic" {
  role       = aws_iam_role.verify_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "verify_lambda_policy" {
  name = "verify-lambda-policy"
  role = aws_iam_role.verify_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem"]
      Resource = [
        aws_dynamodb_table.sessions.arn,
        aws_dynamodb_table.users.arn,
      ]
    }]
  })
}

# ----- List Users Lambda Role -----
resource "aws_iam_role" "list_users_lambda_role" {
  name               = "list-users-lambda-role"
  assume_role_policy = local.lambda_assume_role_policy
}

resource "aws_iam_role_policy_attachment" "list_users_lambda_basic" {
  role       = aws_iam_role.list_users_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "list_users_lambda_policy" {
  name = "list-users-lambda-policy"
  role = aws_iam_role.list_users_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:Scan"]
      Resource = [
        aws_dynamodb_table.sessions.arn,
        aws_dynamodb_table.users.arn,
      ]
    }]
  })
}

# ----- Trade Signals Lambda Role -----
resource "aws_iam_role" "trade_signals_lambda_role" {
  name               = "trade-signals-lambda-role"
  assume_role_policy = local.lambda_assume_role_policy
}

resource "aws_iam_role_policy_attachment" "trade_signals_lambda_basic" {
  role       = aws_iam_role.trade_signals_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "trade_signals_lambda_policy" {
  name = "trade-signals-lambda-policy"
  role = aws_iam_role.trade_signals_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = [aws_dynamodb_table.sessions.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = [
          aws_dynamodb_table.trade_signals.arn,
          "${aws_dynamodb_table.trade_signals.arn}/index/*",
        ]
      }
    ]
  })
}

resource "aws_iam_policy" "lambda_ses" {
  name = "lambda-ses-policy"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ]
      Effect   = "Allow"
      Resource = [
        "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:identity/${var.source_email}",
        "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:identity/${var.destination_email}"
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_ses" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_ses.arn
}

resource "aws_iam_role_policy" "lambda_dynamodb_policy" {
  name = "lambda-dynamodb-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          "${aws_dynamodb_table.users.arn}/index/*",
          aws_dynamodb_table.sessions.arn,
          aws_dynamodb_table.chat_history.arn,
          "${aws_dynamodb_table.chat_history.arn}/index/*",
          aws_dynamodb_table.trade_signals.arn,
          "${aws_dynamodb_table.trade_signals.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_lambda_function" "contact_lambda" {
  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda_role.arn
  handler       = "sendEmailApi.handler"
  runtime       = "nodejs20.x"

  # Use S3 artifacts from infrastructure project
  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      SOURCE_EMAIL      = var.source_email
      DESTINATION_EMAIL = var.destination_email
      DOMAIN_NAME       = "stinessolutions.com"
      USERS_TABLE       = aws_dynamodb_table.users.name
      SESSIONS_TABLE    = aws_dynamodb_table.sessions.name
      CHAT_HISTORY_TABLE = aws_dynamodb_table.chat_history.name
    }
  }
}

resource "aws_lambda_function" "login_lambda" {
  function_name = "auth-login-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "loginHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10  # bcrypt + DynamoDB needs headroom

  # All Lambda functions share the same deployment package
  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE      = aws_dynamodb_table.users.name
      SESSIONS_TABLE   = aws_dynamodb_table.sessions.name
      COOKIE_SAME_SITE = "None"
    }
  }
}

resource "aws_lambda_function" "verify_lambda" {
  function_name = "auth-verify-lambda"
  role          = aws_iam_role.verify_lambda_role.arn
  handler       = "verifyHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10

  # All Lambda functions share the same deployment package
  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}

resource "aws_lambda_function" "logout_lambda" {
  function_name = "auth-logout-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "logoutHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10

  # All Lambda functions share the same deployment package
  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}

resource "aws_lambda_function" "change_password_lambda" {
  function_name = "auth-change-password-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "changePasswordHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10  # Timeout for password hashing

  # All Lambda functions share the same deployment package
  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}

resource "aws_lambda_function" "create_user_lambda" {
  function_name = "auth-create-user-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "createUserHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10  # Timeout for password hashing

  # All Lambda functions share the same deployment package
  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}

resource "aws_lambda_function" "list_users_lambda" {
  function_name = "auth-list-users-lambda"
  role          = aws_iam_role.list_users_lambda_role.arn
  handler       = "listUsersHandler.handler"
  runtime       = "nodejs20.x"

  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}

resource "aws_lambda_function" "delete_user_lambda" {
  function_name = "auth-delete-user-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "deleteUserHandler.handler"
  runtime       = "nodejs20.x"

  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}

resource "aws_lambda_function" "update_user_lambda" {
  function_name = "auth-update-user-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "updateUserHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10

  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}

resource "aws_lambda_function" "reset_user_password_lambda" {
  function_name = "auth-reset-user-password-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "resetUserPasswordHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10  # Timeout for password hashing

  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}

resource "aws_lambda_function" "chat_lambda" {
  function_name = "chat-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "chatHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30  # Increased timeout for API calls

  # All Lambda functions share the same deployment package
  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE        = aws_dynamodb_table.users.name
      SESSIONS_TABLE     = aws_dynamodb_table.sessions.name
      CHAT_HISTORY_TABLE = aws_dynamodb_table.chat_history.name
      GROQ_API_KEY       = var.groq_api_key
    }
  }
}

# ===== Trade Scanner Lambda (EventBridge scheduled) =====
resource "aws_lambda_function" "trade_scanner_lambda" {
  function_name = "trade-scanner-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "tradeScannerHandler.handler"
  runtime       = "nodejs20.x"
  # 10 tickers × 12s delay + processing time; set ceiling well above worst case
  timeout       = 300

  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      TRADE_SIGNALS_TABLE   = aws_dynamodb_table.trade_signals.name
      ALPHA_VANTAGE_API_KEY = var.alpha_vantage_api_key
      WATCHLIST             = var.trade_watchlist
    }
  }
}

# ===== Trade Signals API Lambda (API Gateway GET /trade-signals) =====
resource "aws_lambda_function" "trade_signals_lambda" {
  function_name = "trade-signals-lambda"
  role          = aws_iam_role.trade_signals_lambda_role.arn
  handler       = "tradeSignalsHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10

  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      TRADE_SIGNALS_TABLE = aws_dynamodb_table.trade_signals.name
      SESSIONS_TABLE      = aws_dynamodb_table.sessions.name
      USERS_TABLE         = aws_dynamodb_table.users.name
    }
  }
}

# ===== EventBridge: trigger trade scanner weekdays at 5 PM ET (21:05 UTC) =====
# Note: 21:05 UTC = 5:05 PM ET (EST); accounts for slight post-close data availability
# DST: during EDT (Mar–Nov) this runs at 5:05 PM EDT. Adjust cron if needed.
resource "aws_cloudwatch_event_rule" "trade_scanner_schedule" {
  name                = "trade-scanner-weekday-schedule"
  description         = "Trigger trade scanner Mon–Fri at 5:05 PM ET after market close"
  schedule_expression = "cron(5 21 ? * MON-FRI *)"
}

resource "aws_cloudwatch_event_target" "trade_scanner_target" {
  rule      = aws_cloudwatch_event_rule.trade_scanner_schedule.name
  target_id = "TradeScannerLambda"
  arn       = aws_lambda_function.trade_scanner_lambda.arn
}

resource "aws_lambda_permission" "eventbridge_trade_scanner" {
  statement_id  = "AllowEventBridgeInvokeTradeScannerLambda"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.trade_scanner_lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.trade_scanner_schedule.arn
}

# ===== API Gateway Authorizer Lambda =====
resource "aws_lambda_function" "authorizer_lambda" {
  function_name = "authorizer-lambda"
  role          = aws_iam_role.authorizer_lambda_role.arn
  handler       = "authorizerHandler.handler"
  runtime       = "nodejs20.x"
  timeout       = 10

  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    }
  }
}
