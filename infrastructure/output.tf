output "api_gateway_url" {
  value = "${aws_api_gateway_stage.contact_stage.invoke_url}"
}

output "api_routes" {
  value = {
    contact   = "/contact"
  }
}

output "api_domain_name" {
  value = "${aws_route53_record.api_gateway_record.name}"
}

