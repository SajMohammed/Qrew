# Qrew — residency-first infrastructure (AWS me-central-1, UAE).
# STARTING SKELETON ONLY. Not production-complete: add VPC/subnets/SGs, a remote
# backend (S3 + DynamoDB lock), least-privilege IAM, and secrets via SSM/Secrets Manager.

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # backend "s3" { ... }   # configure a remote, locked backend before real use
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "me-central-1" # UAE
}

variable "db_password" {
  type      = string
  sensitive = true
}

# --- Postgres (start with RDS; move to Aurora when you need replicas) ---------
resource "aws_db_instance" "qrew" {
  identifier                 = "qrew-postgres"
  engine                     = "postgres"
  engine_version             = "16"
  instance_class             = "db.t4g.small" # size up for production
  allocated_storage          = 20
  storage_encrypted          = true
  multi_az                   = true
  backup_retention_period    = 7 # enables PITR
  db_name                    = "qrew"
  username                   = "postgres"
  password                   = var.db_password
  deletion_protection        = true
  auto_minor_version_upgrade = true
  # vpc_security_group_ids   = [...]   # private subnets only
  # db_subnet_group_name     = "..."
}

# --- Redis (ElastiCache) ------------------------------------------------------
resource "aws_elasticache_cluster" "qrew" {
  cluster_id           = "qrew-redis"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  # subnet_group_name  = "..."
  # security_group_ids = [...]
}

# --- Compute (NestJS API + wallet worker) -------------------------------------
# Recommended: ECR repositories + ECS/Fargate services (or AWS App Runner) in-region.
# resource "aws_ecr_repository" "api"    { name = "qrew-api" }
# resource "aws_ecr_repository" "worker" { name = "qrew-wallet-worker" }
# resource "aws_ecs_cluster"    "qrew"   { name = "qrew" }

output "db_endpoint" {
  value = aws_db_instance.qrew.endpoint
}
