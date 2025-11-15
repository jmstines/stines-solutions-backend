output "api_gateway_url" {
  value = "${aws_api_gateway_deployment.contact_deployment.invoke_url}/contact"
}