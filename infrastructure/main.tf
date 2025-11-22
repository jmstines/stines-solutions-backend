terraform {
  backend "s3" {
    bucket         = "stines-solutions-state-bucket"
    key            = "backend/terraform.tfstate" # unique path for this project
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"          # optional for locking
    encrypt        = true
  }
}

resource "aws_iam_role" "lambda_role" {
  name = var.lambda_role_name
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

resource "aws_iam_role_policy_attachment" "lambda_basic_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_ses_policy" {
  name        = "lambda-ses-policy"
  description = "Allow Lambda to send email via SES"
  policy      = jsonencode({
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

resource "aws_iam_role_policy_attachment" "lambda_ses_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_ses_policy.arn
}

resource "aws_lambda_function" "contact_lambda" {
  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda_role.arn
  handler       = "sendEmailApi.handler"
  runtime       = "nodejs18.x"
  filename         = "${abspath(path.module)}/../dist/index.zip"
  source_code_hash = filebase64sha256("${abspath(path.module)}/../dist/index.zip")
  
  environment {
    variables = {
      SOURCE_EMAIL      = var.source_email
      DESTINATION_EMAIL = var.destination_email
      DOMAIN_NAME       = var.domain_name
    }
  }
}

resource "aws_api_gateway_rest_api" "contact_api" {
  name        = "contact-api"
  description = "API Gateway for contact form"
}

resource "aws_api_gateway_resource" "contact_resource" {
  rest_api_id = aws_api_gateway_rest_api.contact_api.id
  parent_id   = aws_api_gateway_rest_api.contact_api.root_resource_id
  path_part   = "contact"
}

resource "aws_api_gateway_method" "options" {
  rest_api_id   = aws_api_gateway_rest_api.contact_api.id
  resource_id   = aws_api_gateway_resource.contact_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "contact_post" {
  rest_api_id   = aws_api_gateway_rest_api.contact_api.id
  resource_id   = aws_api_gateway_resource.contact_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "cors" {
  rest_api_id = aws_api_gateway_rest_api.contact_api.id
  resource_id = aws_api_gateway_resource.contact_resource.id
  http_method = aws_api_gateway_method.contact_post.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_method_response" "options" {
  rest_api_id = aws_api_gateway_rest_api.contact_api.id
  resource_id = aws_api_gateway_resource.contact_resource.id
  http_method = aws_api_gateway_method.options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "options" {
  rest_api_id = aws_api_gateway_rest_api.contact_api.id
  resource_id = aws_api_gateway_resource.contact_resource.id
  http_method = aws_api_gateway_method.options.http_method
  status_code = aws_api_gateway_method_response.options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = var.domain_name
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type'"
  }
}

resource "aws_api_gateway_integration" "options" {
  rest_api_id             = aws_api_gateway_rest_api.contact_api.id
  resource_id             = aws_api_gateway_resource.contact_resource.id
  http_method             = aws_api_gateway_method.options.http_method
  type                    = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_integration" "lambda_integration" {
  rest_api_id             = aws_api_gateway_rest_api.contact_api.id
  resource_id             = aws_api_gateway_resource.contact_resource.id
  http_method             = aws_api_gateway_method.contact_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.contact_lambda.invoke_arn
}

resource "aws_lambda_permission" "api_gateway_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.contact_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.contact_api.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "contact_deployment" {
  depends_on  = [aws_api_gateway_integration.lambda_integration]
  rest_api_id = aws_api_gateway_rest_api.contact_api.id
}

resource "aws_api_gateway_stage" "contact_stage" {
  deployment_id = aws_api_gateway_deployment.contact_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.contact_api.id
  stage_name    = "prod"
}
