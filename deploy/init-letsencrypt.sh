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
# On success this script activates the HTTPS configuration and restarts nginx.

set -eu

# Bootstrap invokes this as an unprivileged user immediately after adding that
# user to the Docker group; the group does not apply until the next login, so it
# passes DOCKER="sudo docker" for that first invocation. Manual runs use docker.
docker_compose() {
    # shellcheck disable=SC2086
    ${DOCKER:-docker} compose "$@"
}

cd "$(dirname "$0")/.."

# A bare clone has no .env. The operations mailbox can be overridden through
# CERTBOT_EMAIL, but has a safe project default so certificate provisioning never
# blocks the bootstrap on a configuration prompt.
DOMAINS="${CERTBOT_DOMAINS:-utilipayhub.com}"
EMAIL="${CERTBOT_EMAIL:-adminutilihub@gmail.com}"

PRIMARY_DOMAIN=$(echo "$DOMAINS" | cut -d, -f1)

# Build the -d flags from the comma-separated list.
DOMAIN_ARGS=""
for domain in $(echo "$DOMAINS" | tr ',' ' '); do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
done

echo "==> Checking that nginx is serving the challenge path"
if ! docker_compose ps nginx | grep -q "Up"; then
    echo "error: the nginx service is not running. Start the stack first:" >&2
    echo "  docker compose up -d --build" >&2
    exit 1
fi

# A real request through the published port, because a certificate request that
# cannot reach the challenge burns one of a small number of retries per hour.
echo "==> Verifying the ACME challenge path is reachable"
CHALLENGE_TOKEN="preflight-$(date +%s)"
docker_compose exec -T nginx sh -c \
    "mkdir -p /var/www/certbot/.well-known/acme-challenge && \
     echo '$CHALLENGE_TOKEN' > /var/www/certbot/.well-known/acme-challenge/$CHALLENGE_TOKEN"

FETCHED=$(curl -fsS --max-time 15 \
    "http://$PRIMARY_DOMAIN/.well-known/acme-challenge/$CHALLENGE_TOKEN" 2>/dev/null || true)

docker_compose exec -T nginx rm -f \
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
docker_compose run --rm --entrypoint certbot certbot \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email "$EMAIL" --agree-tos --no-eff-email \
    --staging --non-interactive \
    $DOMAIN_ARGS

echo "==> Staging succeeded; discarding it and requesting the real certificate"
docker_compose run --rm --entrypoint certbot certbot \
    delete --cert-name "$PRIMARY_DOMAIN" --non-interactive || true

# shellcheck disable=SC2086
docker_compose run --rm --entrypoint certbot certbot \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email "$EMAIL" --agree-tos --no-eff-email \
    --non-interactive \
    $DOMAIN_ARGS

echo "==> Certificate issued for $DOMAINS"
echo "==> Activating the HTTPS server and HTTP-to-HTTPS redirect"

# The HTTPS server is intentionally commented in a fresh clone so nginx can
# start before the certificate files exist. Once issuance succeeds, promote only
# that block and the redirect, validate the resulting configuration, then reload.
sed -i \
    -e '/# return 301 https:\/\/\$host\$request_uri;/ s/^        # //' \
    -e '/^# server {$/,$ s/^# //' \
    deploy/nginx/conf.d/utilipayhub.conf

docker_compose exec -T nginx nginx -t
docker_compose restart nginx

echo ""
echo "HTTPS is active. Verify with: curl -I https://$PRIMARY_DOMAIN"
