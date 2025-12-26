terraform {
  backend "s3" {
    bucket         = "stines-solutions-state-bucket"
    key            = "backend/terraform.tfstate" # unique path for this project
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"          # optional for locking
    encrypt        = true
  }
}

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

resource "aws_lambda_function" "contact_lambda" {
  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda_role.arn
  handler       = "sendEmailApi.handler"
  runtime       = "nodejs18.x"

  # Use S3 artifacts from infrastructure project
  s3_bucket        = data.terraform_remote_state.infrastructure.outputs.lambda_artifact_bucket
  s3_key           = var.lambda_code_s3_key
  source_code_hash = data.aws_s3_object.lambda_zip.etag  # ensures updates when key changes

  environment {
    variables = {
      SOURCE_EMAIL      = var.source_email
      DESTINATION_EMAIL = var.destination_email
      DOMAIN_NAME       = terraform_remote_state.infrastructure.outputs.domain_name
    }
  }
}
