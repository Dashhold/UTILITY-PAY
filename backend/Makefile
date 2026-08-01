.DEFAULT_GOAL := help
.PHONY: help run build test test-verbose cover fmt vet lint check tidy db-up db-down db-reset docker-build compose-up compose-down

BINARY := api
PKG    := ./...

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

run: ## Run the API server
	go run ./cmd/api

build: ## Build a stripped static binary into ./bin
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/$(BINARY) ./cmd/api

test: ## Run all tests
	go test $(PKG)

test-verbose: ## Run all tests with verbose output
	go test -v $(PKG)

cover: ## Run tests and open an HTML coverage report
	go test -coverprofile=coverage.out $(PKG)
	go tool cover -html=coverage.out -o coverage.html
	@echo "coverage report written to coverage.html"

fmt: ## Format all Go source
	gofmt -w ./cmd ./internal

vet: ## Run go vet
	go vet $(PKG)

# The race detector is worth the slowdown here: the token manager and wallet
# service are both concurrency-sensitive.
check: fmt vet ## Format, vet, then run tests with the race detector
	go test -race $(PKG)

tidy: ## Prune and verify module dependencies
	go mod tidy
	go mod verify

db-up: ## Start a local PostgreSQL for development
	docker run -d --name utilipay-postgres \
		-e POSTGRES_PASSWORD=postgres \
		-e POSTGRES_DB=utilipay \
		-p 5432:5432 \
		postgres:16-alpine

db-down: ## Stop and remove the local PostgreSQL
	-docker rm -f utilipay-postgres

db-reset: db-down db-up ## Recreate the local database from scratch
	@echo "waiting for postgres to accept connections..."
	@sleep 8

docker-build: ## Build the API container image
	docker build -t utilipay-api:latest .

compose-up: ## Start the full stack with docker compose
	docker compose up -d --build

compose-down: ## Stop the docker compose stack
	docker compose down
