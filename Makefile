# UtiliPay Hub — deployment shortcuts.
#
# Everything here wraps docker compose. Run `make help` for the list.

COMPOSE := docker compose --env-file .env

.DEFAULT_GOAL := help
.PHONY: help up down build rebuild logs logs-api ps restart shell-api shell-db \
        migrate-status backup restore certs verify clean nuke

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Build and start the whole stack
	@test -f .env || { echo "error: .env not found. cp .env.example .env"; exit 1; }
	$(COMPOSE) up -d --build
	@echo ""
	@echo "Landing page:  http://localhost/"
	@echo "Dashboard:     http://localhost/app/"
	@echo "API health:    http://localhost/readyz"

down: ## Stop the stack, keeping the database
	$(COMPOSE) down

build: ## Build images without starting
	$(COMPOSE) build

rebuild: ## Rebuild from scratch, ignoring the layer cache
	$(COMPOSE) build --no-cache

logs: ## Follow logs from every service
	$(COMPOSE) logs -f

logs-api: ## Follow API logs only
	$(COMPOSE) logs -f api

ps: ## Show container status and health
	$(COMPOSE) ps

restart: ## Restart the API and the proxy without touching the database
	$(COMPOSE) restart api nginx

shell-api: ## Open a shell in the API container
	$(COMPOSE) exec api sh

shell-db: ## Open psql against the application database
	$(COMPOSE) exec postgres psql -U $${DB_USER:-postgres} -d $${DB_NAME:-utilipay}

# Timestamped so a restore is always against a known point rather than whatever
# happened to be written last.
backup: ## Dump the database to ./backups
	@mkdir -p backups
	$(COMPOSE) exec -T postgres pg_dump -U $${DB_USER:-postgres} $${DB_NAME:-utilipay} \
	  | gzip > backups/utilipay-$$(date +%Y%m%d-%H%M%S).sql.gz
	@echo "written to backups/"

restore: ## Restore from a dump: make restore FILE=backups/x.sql.gz
	@test -n "$(FILE)" || { echo "error: pass FILE=backups/<file>.sql.gz"; exit 1; }
	@echo "This overwrites the current database. Ctrl-C within 5 seconds to abort."
	@sleep 5
	gunzip -c $(FILE) | $(COMPOSE) exec -T postgres \
	  psql -U $${DB_USER:-postgres} -d $${DB_NAME:-utilipay}

certs: ## Issue the first TLS certificate (run once, after DNS is pointed here)
	./deploy/init-letsencrypt.sh

verify: ## Check that every route the browser needs is answering
	@./deploy/verify-routes.sh

clean: ## Remove stopped containers and dangling images
	$(COMPOSE) down --remove-orphans
	docker image prune -f

nuke: ## Destroy everything including the database volume
	@echo "This DESTROYS the database. Ctrl-C within 5 seconds to abort."
	@sleep 5
	$(COMPOSE) down -v --remove-orphans
