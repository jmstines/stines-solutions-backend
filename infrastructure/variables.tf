variable "aws_region" {
  default = "us-east-1"
}

variable "lambda_function_name" {
  default = "contact-form-lambda"
}

variable "lambda_role_name" {
  default = "contact-form-lambda-role"
}

variable "source_email" {
  description = "Verified SES email address"
}

variable "destination_email" {
  description = "Destination email for contact form"
}

variable "domain_name" {
  description = "Domain name for API Gateway custom domain"
  default = "https://*.stinessolutions.com"
}