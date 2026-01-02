output "api_gateway_url" {
  value       = "https://${aws_api_gateway_domain_name.api_domain.domain_name}"
  description = "Custom domain URL for the API Gateway"
}

output "api_gateway_base_url" {
  value       = aws_api_gateway_stage.backend_stage.invoke_url
  description = "Direct AWS API Gateway URL"
}

output "lambda_function_name" {
  value = aws_lambda_function.contact_lambda.function_name
}

output "login_lambda_function_name" {
  value = aws_lambda_function.login_lambda.function_name
}

output "verify_lambda_function_name" {
  value = aws_lambda_function.verify_lambda.function_name
}

output "logout_lambda_function_name" {
  value = aws_lambda_function.logout_lambda.function_name
}

output "lambda_arn" {
  value = aws_lambda_function.contact_lambda.arn
}
