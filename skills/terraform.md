# Terraform / OpenTofu Skill

Loaded when the project uses Terraform or OpenTofu for infrastructure
provisioning. Supplements `rules/conventions.md` with IaC-specific patterns.

---

## Project Setup

- **Terraform**: `terraform init`, `terraform plan`, `terraform apply`
- **OpenTofu**: `tofu init`, `tofu plan`, `tofu apply`
- **Validate**: `terraform validate` (syntax + internal consistency)
- **Format**: `terraform fmt -recursive`
- **Lint**: `tflint` (recommended), `checkov` (security scanning)
- **State**: Always use remote state (S3, Terraform Cloud, etc.). Never
  commit `terraform.tfstate` to git.


## Directory Layout

```
terraform/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   │   └── ...
│   └── prod/
│       └── ...
├── modules/
│   ├── networking/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   ├── compute/
│   │   └── ...
│   └── database/
│       └── ...
├── provider.tf
└── versions.tf
```

## Conventions

### Naming

- **Resources**: `resource_type_identifier` — `aws_s3_bucket_assets`
- **Variables**: `snake_case` — `instance_count`, `vpc_cidr_block`
- **Outputs**: `snake_case` — `bucket_arn`, `load_balancer_dns`
- **Files**: `snake_case.tf` — `main.tf`, `variables.tf`, `outputs.tf`
- **Modules**: Short, descriptive — `networking`, `compute`, `database`

### Structure

```hcl
# versions.tf — required_providers block
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    # Configured per environment or via partial config
  }
}
```

```hcl
# provider.tf
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = var.project_name
    }
  }
}
```

### Resource Conventions

```hcl
# Good — explicit, tagged, with lifecycle
resource "aws_s3_bucket" "assets" {
  bucket = "${var.project_name}-${var.environment}-assets"
  force_destroy = var.environment == "dev" ? true : false

  tags = {
    Name = "${var.project_name}-assets"
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Bad — no tags, no lifecycle, no encryption
resource "aws_s3_bucket" "bad_example" {
  bucket = "my-bucket"
}
```

### Variables & Outputs

```hcl
# variables.tf
variable "instance_count" {
  description = "Number of EC2 instances to launch"
  type        = number
  default     = 1

  validation {
    condition     = var.instance_count > 0 && var.instance_count <= 100
    error_message = "instance_count must be between 1 and 100."
  }
}

variable "environment" {
  description = "Deployment environment"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}
```

```hcl
# outputs.tf
output "bucket_arn" {
  description = "ARN of the assets S3 bucket"
  value       = aws_s3_bucket.assets.arn
}
```

### State Management

- **Remote state**: S3 + DynamoDB locking (or Terraform Cloud).
  ```hcl
  backend "s3" {
    bucket         = "my-tfstate-bucket"
    key            = "env:/${var.environment}/network/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
  ```
- **Workspaces** per environment (`terraform workspace new dev`), or
  directory-per-environment layout. Choose one per project and be consistent.
- **State files never committed** — add `*.tfstate*` to `.gitignore`.

### Testing & Validation

- **`terraform validate`** in CI for every PR.
- **`tflint`** in CI. Configure:
  ```hcl
  # .tflint.hcl
  plugin "aws" {
    enabled = true
    version = "0.30.0"
    source  = "github.com/terraform-linters/tflint-ruleset-aws"
  }
  ```
- **`checkov --directory .`** for security scanning.
- **`terraform plan -out=tfplan`** reviewed by a human before apply.
- **Terratest** (Go) for integration tests against real infra (optional, for
  critical modules).

### Secrets

- **Never hardcode secrets** in `.tf` or `.tfvars` files.
- Use a secrets manager (AWS Secrets Manager, Vault, SOPS) referenced by ARN.
  ```hcl
  data "aws_secretsmanager_secret_version" "db_password" {
    secret_id = "my-db-password"
  }
  ```
- Or use `sensitive = true` on variables and pass via environment:
  ```sh
  TF_VAR_db_password=<value> terraform apply
  ```

### Modules

- Every module gets a `README.md` describing: inputs, outputs, dependencies,
  and example usage.
- Modules should be reusable across environments — use `count` or `for_each`
  with variable-driven maps.
- Pin module versions (git tag or registry version):
  ```hcl
  module "networking" {
    source  = "terraform-aws-modules/vpc/aws"
    version = "5.0.0"
    name = "${var.project_name}-${var.environment}"
  }
  ```
