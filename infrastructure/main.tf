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
      Resource = "*"
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
          "${aws_dynamodb_table.chat_history.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = [
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/stines-solutions/huggingface/*"
        ]
      }
    ]
  })
}

resource "aws_lambda_function" "contact_lambda" {
  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda_role.arn
  handler       = "sendEmailApi.handler"
  runtime       = "nodejs18.x"

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
  runtime       = "nodejs18.x"

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

resource "aws_lambda_function" "verify_lambda" {
  function_name = "auth-verify-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "verifyHandler.handler"
  runtime       = "nodejs18.x"

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
  runtime       = "nodejs18.x"

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
  runtime       = "nodejs18.x"
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

resource "aws_lambda_function" "chat_lambda" {
  function_name = "chat-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "chatHandler.handler"
  runtime       = "nodejs18.x"
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
    }
  }
}
