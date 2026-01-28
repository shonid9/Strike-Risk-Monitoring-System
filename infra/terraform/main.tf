terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "us-east-1"
}

# Placeholder resources to illustrate IaC layout.
resource "aws_s3_bucket" "raw_events" {
  bucket = "strike-risk-raw-events"
}

resource "aws_s3_bucket" "models" {
  bucket = "strike-risk-model-artifacts"
}
