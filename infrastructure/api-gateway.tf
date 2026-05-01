# API Gateway for backend Lambda functions
# This file creates the API Gateway and wires it to Lambda functions

resource "aws_api_gateway_rest_api" "backend_api" {
  name        = "backend-api"
  description = "API Gateway for backend services (contact form, auth)"
}

# ===== IMPORTANT: When adding new Lambda functions or API resources =====
# Update the depends_on and triggers lists below to ensure redeployment
resource "aws_api_gateway_deployment" "backend_deployment" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id

  depends_on = [
    aws_api_gateway_integration.contact_lambda,
    aws_api_gateway_integration.login_lambda,
    aws_api_gateway_integration.verify_lambda,
    aws_api_gateway_integration.logout_lambda,
    aws_api_gateway_integration.change_password_lambda,
    aws_api_gateway_integration.create_user_lambda,
    aws_api_gateway_integration.list_users_lambda,
    aws_api_gateway_integration.delete_user_lambda,
    aws_api_gateway_integration.update_user_lambda,
    aws_api_gateway_integration.reset_user_password_lambda,
    aws_api_gateway_integration.chat_post,
    aws_api_gateway_integration.chat_conversations_get,
    aws_api_gateway_integration.chat_conversation_get,
    aws_api_gateway_integration.chat_conversation_delete,
    aws_api_gateway_integration.trade_signals_get,
    aws_api_gateway_integration.trade_signals_options
  ]

  lifecycle {
    create_before_destroy = true
  }

  triggers = {
    # Force redeployment on any change to Lambda functions, API resources, or code
    redeployment = sha1(jsonencode([
      aws_lambda_function.contact_lambda.id,
      aws_lambda_function.login_lambda.id,
      aws_lambda_function.verify_lambda.id,
      aws_lambda_function.logout_lambda.id,
      aws_lambda_function.change_password_lambda.id,
      aws_lambda_function.create_user_lambda.id,
      aws_lambda_function.list_users_lambda.id,
      aws_lambda_function.delete_user_lambda.id,
      aws_lambda_function.update_user_lambda.id,
      aws_lambda_function.reset_user_password_lambda.id,
      aws_lambda_function.chat_lambda.id,
      aws_api_gateway_resource.chat_resource.id,
      aws_api_gateway_resource.chat_conversations.id,
      aws_api_gateway_resource.chat_conversation_id.id,
      aws_api_gateway_resource.change_password_resource.id,
      aws_api_gateway_resource.create_user_resource.id,
      aws_api_gateway_resource.users_resource.id,
      aws_api_gateway_resource.user_id_resource.id,
      aws_api_gateway_resource.reset_password_resource.id,
      aws_api_gateway_resource.trade_signals_resource.id,
      aws_lambda_function.trade_signals_lambda.id,
      var.lambda_code_s3_key, # Auto-redeploy when Lambda code changes
    ]))
  }
}

resource "aws_api_gateway_stage" "backend_stage" {
  deployment_id = aws_api_gateway_deployment.backend_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  stage_name    = "prod"
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

# ===== /auth/change-password Resource =====
resource "aws_api_gateway_resource" "change_password_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.auth_resource.id
  path_part   = "change-password"
}

resource "aws_api_gateway_method" "change_password_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.change_password_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "change_password_post" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.change_password_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "change_password_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.change_password_resource.id
  http_method             = aws_api_gateway_method.change_password_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.change_password_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "change_password_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.change_password_resource.id
  http_method = aws_api_gateway_method.change_password_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration" "change_password_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.change_password_resource.id
  http_method             = aws_api_gateway_method.change_password_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.change_password_lambda.invoke_arn
}

resource "aws_lambda_permission" "change_password_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeChangePassword"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.change_password_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

# ===== /auth/create-user Resource =====
resource "aws_api_gateway_resource" "create_user_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.auth_resource.id
  path_part   = "create-user"
}

resource "aws_api_gateway_method" "create_user_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.create_user_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "create_user_post" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.create_user_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "create_user_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.create_user_resource.id
  http_method             = aws_api_gateway_method.create_user_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.create_user_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "create_user_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.create_user_resource.id
  http_method = aws_api_gateway_method.create_user_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration" "create_user_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.create_user_resource.id
  http_method             = aws_api_gateway_method.create_user_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.create_user_lambda.invoke_arn
}

resource "aws_lambda_permission" "create_user_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeCreateUser"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_user_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

# ===== /auth/users Resource =====
resource "aws_api_gateway_resource" "users_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.auth_resource.id
  path_part   = "users"
}

resource "aws_api_gateway_method" "list_users_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.users_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "list_users_get" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.users_resource.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "list_users_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.users_resource.id
  http_method             = aws_api_gateway_method.list_users_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.list_users_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "list_users_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.users_resource.id
  http_method = aws_api_gateway_method.list_users_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration" "list_users_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.users_resource.id
  http_method             = aws_api_gateway_method.list_users_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.list_users_lambda.invoke_arn
}

resource "aws_lambda_permission" "list_users_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeListUsers"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.list_users_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

# ===== /auth/users/{userId} Resource =====
resource "aws_api_gateway_resource" "user_id_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.users_resource.id
  path_part   = "{userId}"
}

resource "aws_api_gateway_method" "user_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.user_id_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "delete_user" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.user_id_resource.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "update_user" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.user_id_resource.id
  http_method   = "PUT"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "user_id_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.user_id_resource.id
  http_method             = aws_api_gateway_method.user_id_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.delete_user_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "user_id_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.user_id_resource.id
  http_method = aws_api_gateway_method.user_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration" "delete_user_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.user_id_resource.id
  http_method             = aws_api_gateway_method.delete_user.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.delete_user_lambda.invoke_arn
}

resource "aws_api_gateway_integration" "update_user_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.user_id_resource.id
  http_method             = aws_api_gateway_method.update_user.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.update_user_lambda.invoke_arn
}

resource "aws_lambda_permission" "delete_user_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeDeleteUser"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_user_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "update_user_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeUpdateUser"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.update_user_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

# ===== /auth/users/{userId}/reset-password Resource =====
resource "aws_api_gateway_resource" "reset_password_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.user_id_resource.id
  path_part   = "reset-password"
}

resource "aws_api_gateway_method" "reset_password_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.reset_password_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "reset_password_post" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.reset_password_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "reset_password_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.reset_password_resource.id
  http_method             = aws_api_gateway_method.reset_password_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.reset_user_password_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "reset_password_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.reset_password_resource.id
  http_method = aws_api_gateway_method.reset_password_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_api_gateway_integration" "reset_user_password_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.reset_password_resource.id
  http_method             = aws_api_gateway_method.reset_password_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.reset_user_password_lambda.invoke_arn
}

resource "aws_lambda_permission" "reset_user_password_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeResetUserPassword"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reset_user_password_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
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
    data_trace_enabled = false
    metrics_enabled    = true
    throttling_burst_limit = 100  # Max concurrent requests
    throttling_rate_limit  = 50   # Requests per second
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

# ===== Usage Plan for Rate Limiting =====
resource "aws_api_gateway_usage_plan" "backend_usage_plan" {
  name        = "stines-solutions-backend-usage-plan"
  description = "Usage plan with rate limiting for backend API"

  api_stages {
    api_id = aws_api_gateway_rest_api.backend_api.id
    stage  = aws_api_gateway_stage.backend_stage.stage_name
  }

  quota_settings {
    limit  = 10000  # 10k requests per month (well under free tier 1M)
    period = "MONTH"
  }

  throttle_settings {
    burst_limit = 100  # Max concurrent requests
    rate_limit  = 50   # Requests per second
  }
}

# ===== /chat Resource =====
resource "aws_api_gateway_resource" "chat_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_rest_api.backend_api.root_resource_id
  path_part   = "chat"
}

# POST /chat - Send message
resource "aws_api_gateway_method" "chat_post" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.chat_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_post" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.chat_resource.id
  http_method             = aws_api_gateway_method.chat_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.chat_lambda.invoke_arn
}

resource "aws_lambda_permission" "api_gateway_chat" {
  statement_id  = "AllowAPIGatewayInvokeChat"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chat_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}

# OPTIONS /chat
resource "aws_api_gateway_method" "chat_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.chat_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.chat_resource.id
  http_method             = aws_api_gateway_method.chat_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.chat_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "chat_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.chat_resource.id
  http_method = aws_api_gateway_method.chat_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

# /chat/conversations - List conversations
resource "aws_api_gateway_resource" "chat_conversations" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.chat_resource.id
  path_part   = "conversations"
}

resource "aws_api_gateway_method" "chat_conversations_get" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.chat_conversations.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_conversations_get" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.chat_conversations.id
  http_method             = aws_api_gateway_method.chat_conversations_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.chat_lambda.invoke_arn
}

# OPTIONS /chat/conversations
resource "aws_api_gateway_method" "chat_conversations_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.chat_conversations.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_conversations_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.chat_conversations.id
  http_method             = aws_api_gateway_method.chat_conversations_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.chat_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "chat_conversations_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.chat_conversations.id
  http_method = aws_api_gateway_method.chat_conversations_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

# /chat/conversations/{id} - Get/Delete specific conversation
resource "aws_api_gateway_resource" "chat_conversation_id" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_resource.chat_conversations.id
  path_part   = "{id}"
}

resource "aws_api_gateway_method" "chat_conversation_get" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.chat_conversation_id.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_conversation_get" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.chat_conversation_id.id
  http_method             = aws_api_gateway_method.chat_conversation_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.chat_lambda.invoke_arn
}

resource "aws_api_gateway_method" "chat_conversation_delete" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.chat_conversation_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_conversation_delete" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.chat_conversation_id.id
  http_method             = aws_api_gateway_method.chat_conversation_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.chat_lambda.invoke_arn
}

# OPTIONS /chat/conversations/{id}
resource "aws_api_gateway_method" "chat_conversation_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.chat_conversation_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_conversation_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.chat_conversation_id.id
  http_method             = aws_api_gateway_method.chat_conversation_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.chat_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "chat_conversation_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.chat_conversation_id.id
  http_method = aws_api_gateway_method.chat_conversation_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

# ===== /trade-signals Resource =====
resource "aws_api_gateway_resource" "trade_signals_resource" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  parent_id   = aws_api_gateway_rest_api.backend_api.root_resource_id
  path_part   = "trade-signals"
}

# GET /trade-signals
resource "aws_api_gateway_method" "trade_signals_get" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.trade_signals_resource.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "trade_signals_get" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.trade_signals_resource.id
  http_method             = aws_api_gateway_method.trade_signals_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.trade_signals_lambda.invoke_arn
}

# OPTIONS /trade-signals (CORS preflight)
resource "aws_api_gateway_method" "trade_signals_options" {
  rest_api_id   = aws_api_gateway_rest_api.backend_api.id
  resource_id   = aws_api_gateway_resource.trade_signals_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "trade_signals_options" {
  rest_api_id             = aws_api_gateway_rest_api.backend_api.id
  resource_id             = aws_api_gateway_resource.trade_signals_resource.id
  http_method             = aws_api_gateway_method.trade_signals_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.trade_signals_lambda.invoke_arn
}

resource "aws_api_gateway_method_response" "trade_signals_options" {
  rest_api_id = aws_api_gateway_rest_api.backend_api.id
  resource_id = aws_api_gateway_resource.trade_signals_resource.id
  http_method = aws_api_gateway_method.trade_signals_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

resource "aws_lambda_permission" "api_gateway_trade_signals" {
  statement_id  = "AllowAPIGatewayInvokeTradeSignals"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.trade_signals_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.backend_api.execution_arn}/*/*"
}
