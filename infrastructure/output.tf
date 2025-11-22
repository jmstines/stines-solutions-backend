output "api_gateway_url" {
  value = "${aws_api_gateway_stage.contact_stage.invoke_url}"
}

output "api_routes" {
  value = {
    contact   = "/contact"
  }
}
