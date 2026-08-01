#!/bin/sh
# Checks that every route a browser needs is answering through the proxy.
#
# Run after `make up`. Exercises the actual published port rather than the
# containers directly, so a routing mistake in nginx is caught rather than hidden.
#
#   ./deploy/verify-routes.sh              # against http://localhost
#   BASE=https://utilipayhub.com ./deploy/verify-routes.sh

set -eu

BASE="${BASE:-http://localhost}"
PASS=0
FAIL=0

# check <description> <path> <expected-status>
check() {
    description="$1"
    path="$2"
    expected="$3"

    actual=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE$path" 2>/dev/null || echo "000")

    if [ "$actual" = "$expected" ]; then
        printf 'PASS  %-46s %s %s\n' "$description" "$path" "$actual"
        PASS=$((PASS + 1))
    else
        printf 'FAIL  %-46s %s got %s, want %s\n' "$description" "$path" "$actual" "$expected"
        FAIL=$((FAIL + 1))
    fi
}

# contains <description> <path> <needle>
contains() {
    description="$1"
    path="$2"
    needle="$3"

    if curl -s --max-time 20 "$BASE$path" 2>/dev/null | grep -q "$needle"; then
        printf 'PASS  %-46s %s\n' "$description" "$path"
        PASS=$((PASS + 1))
    else
        printf 'FAIL  %-46s %s (missing %s)\n' "$description" "$path" "$needle"
        FAIL=$((FAIL + 1))
    fi
}

echo "Verifying $BASE"
echo ""

# --- the landing page must own the root ---
check "landing page at root"                   "/"                 200
contains "root serves the marketing site"      "/"                 "UTILIPAY"
check "landing services page"                  "/services"         200
check "landing about page"                     "/about"            200
check "landing contact page"                   "/contact"          200
check "landing partner page"                   "/partner"          200
check "robots.txt"                             "/robots.txt"       200
check "sitemap.xml"                            "/sitemap.xml"      200

echo ""

# --- the dashboard lives under /app ---
check "bare /app redirects to /app/"           "/app"              301
check "dashboard shell"                        "/app/"             200
contains "dashboard html references /app assets" "/app/"           "/app/assets/"
# A deep link must return the shell, not a 404: the path is a client-side route.
check "deep link returns the shell"            "/app/login"        200
check "admin deep link returns the shell"      "/app/admin"        200
check "retailer deep link returns the shell"   "/app/retailer/kyc" 200

echo ""

# --- the API is reachable on the same origin ---
check "readiness probe"                        "/readyz"           200
contains "readiness reports the database"      "/readyz"           '"database":"ok"'
# Unauthenticated, so 401 is the correct answer and proves the proxy reached the
# API rather than serving a static file.
check "protected endpoint refuses anonymous"   "/api/v1/auth/me"   401
check "unknown api path is a 404 from the api" "/api/v1/nope"      404

echo ""

# --- login works end to end ---
LOGIN_STATUS=$(curl -s -o /tmp/utilipay-login.json -w '%{http_code}' --max-time 20 \
    -X POST "$BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${SEED_ADMIN_EMAIL:-adminutilihub@gmail.com}\",\"password\":\"${SEED_ADMIN_PASSWORD:-utilihub@admin}\"}" \
    2>/dev/null || echo "000")

if [ "$LOGIN_STATUS" = "200" ] && grep -q '"accessToken"' /tmp/utilipay-login.json; then
    printf 'PASS  %-46s %s\n' "admin login returns a token" "/api/v1/auth/login"
    PASS=$((PASS + 1))

    TOKEN=$(sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p' /tmp/utilipay-login.json)
    ME_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
        -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/auth/me" 2>/dev/null || echo "000")

    if [ "$ME_STATUS" = "200" ]; then
        printf 'PASS  %-46s %s\n' "token authenticates a request" "/api/v1/auth/me"
        PASS=$((PASS + 1))
    else
        printf 'FAIL  %-46s got %s\n' "token authenticates a request" "$ME_STATUS"
        FAIL=$((FAIL + 1))
    fi
else
    printf 'FAIL  %-46s got %s\n' "admin login returns a token" "$LOGIN_STATUS"
    FAIL=$((FAIL + 1))
fi

RETAILER_STATUS=$(curl -s -o /tmp/utilipay-retailer.json -w '%{http_code}' --max-time 20 \
    -X POST "$BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${SEED_RETAILER_EMAIL:-retailer.demo@gmail.com}\",\"password\":\"${SEED_RETAILER_PASSWORD:-demo@retailer}\"}" \
    2>/dev/null || echo "000")

if [ "$RETAILER_STATUS" = "200" ] && grep -q '"accessToken"' /tmp/utilipay-retailer.json; then
    printf 'PASS  %-46s %s\n' "retailer login returns a token" "/api/v1/auth/login"
    PASS=$((PASS + 1))
else
    printf 'FAIL  %-46s got %s\n' "retailer login returns a token" "$RETAILER_STATUS"
    FAIL=$((FAIL + 1))
fi

# A wrong password must be refused; a 200 here would mean authentication is not
# actually checking anything.
BAD_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    -X POST "$BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"adminutilihub@gmail.com","password":"definitely-wrong"}' \
    2>/dev/null || echo "000")

if [ "$BAD_STATUS" = "401" ]; then
    printf 'PASS  %-46s %s\n' "wrong password is refused" "/api/v1/auth/login"
    PASS=$((PASS + 1))
else
    printf 'FAIL  %-46s got %s, want 401\n' "wrong password is refused" "$BAD_STATUS"
    FAIL=$((FAIL + 1))
fi

rm -f /tmp/utilipay-login.json /tmp/utilipay-retailer.json

echo ""
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
