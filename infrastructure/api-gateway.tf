# API Gateway for backend Lambda functions
# This file creates the API Gateway and wires it to Lambda functions

resource "aws_api_gateway_rest_api" "backend_api" {
  name        = "backend-api"
  description = "API Gateway for backend services (contact form, auth)"
}

# ===== /contact Resource =====
resource "aws_api_gateway_resource" "contact_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_rest_api.backend_api.root_resource_id
  path_part   = "contact"
}

resource "aws_api_gateway_method" "contact_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.contact_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "contact_post" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.contact_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "contact_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.contact_resource.id
  http_method             = aws_api_gateway_method.contact_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.contact_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "contact_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.contact_resource.id
  http_method = aws_api_gateway_method.contact_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration" "contact_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.contact_resource.id
  http_method             = aws_api_gateway_method.contact_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.contact_lambda.invoke_arn
}

resource "aws_lambda_permission" "contact_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeContact"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.contact_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

resource "aws_api_gateway_resource" "auth_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_rest_api.backend_api.root_resource_id
  path_part   = "auth"
}

resource "aws_api_gateway_resource" "login_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.auth_resource.id
  path_part   = "login"
}

resource "aws_api_gateway_method" "login_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.login_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "login_post" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.login_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "login_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.login_resource.id
  http_method             = aws_api_gateway_method.login_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.login_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "login_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.login_resource.id
  http_method = aws_api_gateway_method.login_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration" "login_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.login_resource.id
  http_method             = aws_api_gateway_method.login_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.login_lambda.invoke_arn
}

resource "aws_lambda_permission" "login_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeLogin"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.login_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

resource "aws_api_gateway_resource" "verify_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.auth_resource.id
  path_part   = "verify"
}

resource "aws_api_gateway_method" "verify_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.verify_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "verify_get" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.verify_resource.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "verify_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.verify_resource.id
  http_method             = aws_api_gateway_method.verify_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.verify_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "verify_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.verify_resource.id
  http_method = aws_api_gateway_method.verify_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration" "verify_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.verify_resource.id
  http_method             = aws_api_gateway_method.verify_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.verify_lambda.invoke_arn
}

resource "aws_lambda_permission" "verify_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeVerify"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

resource "aws_api_gateway_resource" "logout_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.auth_resource.id
  path_part   = "logout"
}

resource "aws_api_gateway_method" "logout_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.logout_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "logout_post" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.logout_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "logout_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.logout_resource.id
  http_method             = aws_api_gateway_method.logout_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.logout_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "logout_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.logout_resource.id
  http_method = aws_api_gateway_method.logout_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration" "logout_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.logout_resource.id
  http_method             = aws_api_gateway_method.logout_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.logout_lambda.invoke_arn
}

resource "aws_lambda_permission" "logout_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeLogout"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.logout_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "backend_deployment" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id

  depends_on = [
    aws_api_gateway_integration.contact_lambda,
    aws_api_gateway_integration.login_lambda,
    aws_api_gateway_integration.verify_lambda,
    aws_api_gateway_integration.logout_lambda
  ]

  lifecycle {
    create_before_destroy = true
  }

  triggers = {
    redeployment = sha1(jsonencode([
      aws_lambda_function.contact_lambda.id,
      aws_lambda_function.login_lambda.id,
      aws_lambda_function.verify_lambda.id,
      aws_lambda_function.logout_lambda.id,
    ]))
  }
}

resource "aws_api_gateway_stage" "backend_stage" {
  deployment_id = aws_api_gateway_deployment.backend_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  stage_name    = "prod"
}

# ===== CloudWatch Logs =====
# IAM role for API Gateway to write to CloudWatch Logs
resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "api-gateway-cloudwatch-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "apigateway.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# Set the CloudWatch Logs role for API Gateway at the account level
resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/backend-api"
  retention_in_days = 7
}

resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  stage_name  = aws_api_gateway_stage.backend_stage.stage_name
  method_path = "*/*"

  settings {
    logging_level      = "INFO"
    data_trace_enabled = true
    metrics_enabled    = true
  }

  depends_on = [aws_api_gateway_account.main]
}

# ===== Custom Domain =====
# Use the main certificate which includes api.domain_name as a SAN
data "aws_acm_certificate" "api_cert" {
  domain   = data.terraform_remote_state.infrastructure.outputs.domain_name
  statuses = ["ISSUED"]
  most_recent = true
}

resource "aws_api_gateway_domain_name" "api_domain" {
  domain_name              = "api.${data.terraform_remote_state.infrastructure.outputs.domain_name}"
  regional_certificate_arn = data.aws_acm_certificate.api_cert.arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_base_path_mapping" "api_mapping" {
  api_id      = aws_api_gateway_rest_api.backend_api.id
  stage_name  = aws_api_gateway_stage.backend_stage.stage_name
  domain_name = aws_api_gateway_domain_name.api_domain.domain_name
}

resource "aws_route53_record" "api" {
  zone_id = data.terraform_remote_state.infrastructure.outputs.hosted_zone_id
  name    = "api.${data.terraform_remote_state.infrastructure.outputs.domain_name}"
  type    = "A"

  alias {
    name                   = aws_api_gateway_domain_name.api_domain.regional_domain_name
    zone_id                = aws_api_gateway_domain_name.api_domain.regional_zone_id
    evaluate_target_health = true
  }
}
