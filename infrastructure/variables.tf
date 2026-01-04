variable "aws_region" {
  default = "us-east-1"
}

variable "lambda_function_name" {
  default = "contact-form-lambda"
}

variable "lambda_code_s3_key" {
  description = "Path to the Lambda ZIP in the artifact bucket (e.g., lambda/contact/<git-sha>.zip)"
  type        = string
}


variable "source_email" {
  description = "Verified SES email address"
}

variable "destination_email" {
  description = "Destination email for contact form"
}

variable "groq_api_key" {
  description = "Groq API key for chat functionality"
  type        = string
  sensitive   = true
}
