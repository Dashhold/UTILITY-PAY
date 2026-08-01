#!/bin/sh
# Issues the first Let's Encrypt certificate for utilipayhub.com.
#
# Run once, on the EC2 instance, after the stack is up and reachable over HTTP.
# Renewal afterwards is handled by the certbot service in docker-compose.yml.
#
#   ./deploy/init-letsencrypt.sh
#
# Prerequisites, all of which this script checks:
#   - the A record for the domain points at this instance
#   - port 80 is open in the security group
#   - the stack is running, so nginx can serve the ACME challenge
#
# Afterwards, uncomment the HTTPS server block and the HTTP redirect in
# deploy/nginx/conf.d/utilipayhub.conf and run: docker compose restart nginx

set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
    echo "error: .env not found. Copy .env.example to .env first." >&2
    exit 1
fi

# shellcheck disable=SC1091
. ./.env

DOMAINS="${CERTBOT_DOMAINS:-utilipayhub.com,www.utilipayhub.com}"
EMAIL="${CERTBOT_EMAIL:-}"

if [ -z "$EMAIL" ]; then
    echo "error: CERTBOT_EMAIL must be set in .env." >&2
    echo "Let's Encrypt uses it for expiry warnings, which is the only notice you" >&2
    echo "get before a silent certificate failure." >&2
    exit 1
fi

PRIMARY_DOMAIN=$(echo "$DOMAINS" | cut -d, -f1)

# Build the -d flags from the comma-separated list.
DOMAIN_ARGS=""
for domain in $(echo "$DOMAINS" | tr ',' ' '); do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
done

echo "==> Checking that nginx is serving the challenge path"
if ! docker compose ps nginx | grep -q "Up"; then
    echo "error: the nginx service is not running. Start the stack first:" >&2
    echo "  docker compose --env-file .env up -d --build" >&2
    exit 1
fi

# A real request through the published port, because a certificate request that
# cannot reach the challenge burns one of a small number of retries per hour.
echo "==> Verifying the ACME challenge path is reachable"
CHALLENGE_TOKEN="preflight-$(date +%s)"
docker compose exec -T nginx sh -c \
    "mkdir -p /var/www/certbot/.well-known/acme-challenge && \
     echo '$CHALLENGE_TOKEN' > /var/www/certbot/.well-known/acme-challenge/$CHALLENGE_TOKEN"

FETCHED=$(curl -fsS --max-time 15 \
    "http://$PRIMARY_DOMAIN/.well-known/acme-challenge/$CHALLENGE_TOKEN" 2>/dev/null || true)

docker compose exec -T nginx rm -f \
    "/var/www/certbot/.well-known/acme-challenge/$CHALLENGE_TOKEN" || true

if [ "$FETCHED" != "$CHALLENGE_TOKEN" ]; then
    echo "error: could not fetch the challenge file over HTTP from $PRIMARY_DOMAIN." >&2
    echo "Check that:" >&2
    echo "  - the DNS A record for $PRIMARY_DOMAIN points at this instance" >&2
    echo "  - port 80 is open in the EC2 security group" >&2
    echo "Fix that before continuing; Let's Encrypt rate-limits failed attempts." >&2
    exit 1
fi
echo "    reachable"

# --staging first so a misconfiguration does not consume the weekly rate limit for
# the real certificate.
echo "==> Requesting a staging certificate (dry run against the real flow)"
# shellcheck disable=SC2086
docker compose run --rm --entrypoint certbot certbot \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email "$EMAIL" --agree-tos --no-eff-email \
    --staging --non-interactive \
    $DOMAIN_ARGS

echo "==> Staging succeeded; discarding it and requesting the real certificate"
docker compose run --rm --entrypoint certbot certbot \
    delete --cert-name "$PRIMARY_DOMAIN" --non-interactive || true

# shellcheck disable=SC2086
docker compose run --rm --entrypoint certbot certbot \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email "$EMAIL" --agree-tos --no-eff-email \
    --non-interactive \
    $DOMAIN_ARGS

echo ""
echo "==> Certificate issued for $DOMAINS"
echo ""
echo "Now enable HTTPS:"
echo "  1. Edit deploy/nginx/conf.d/utilipayhub.conf"
echo "  2. Uncomment the 'server { listen 443 ssl; ... }' block at the bottom"
echo "  3. Uncomment the 'return 301 https://...' line in the port 80 block"
echo "  4. docker compose restart nginx"
echo ""
echo "Verify with: curl -I https://$PRIMARY_DOMAIN"
