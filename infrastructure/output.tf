output "api_gateway_url" {
  value = data.terraform_remote_state.infrastructure.outputs.api_gateway_url
}

output "lambda_function_name" {
  value = aws_lambda_function.contact_lambda.function_name
}

output "lambda_arn" {
  value = aws_lambda_function.contact_lambda.arn
}
