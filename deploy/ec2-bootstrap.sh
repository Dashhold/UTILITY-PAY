#!/bin/bash
# Prepares a fresh EC2 instance and starts the stack.
#
# Installs Docker, adds swap so the frontend builds do not run out of memory on a
# small instance, then brings everything up. No configuration step: every value in
# docker-compose.yml has a working default.
#
#   git clone https://github.com/Dashhold/UTILITY-PAY.git utilipay
#   cd utilipay
#   chmod +x deploy/ec2-bootstrap.sh
#   ./deploy/ec2-bootstrap.sh
#
# Supports Amazon Linux 2023 and Ubuntu 22.04/24.04.

set -euo pipefail

log()  { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33m !\033[0m %s\n' "$1"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Run as the normal user (ec2-user or ubuntu), not root. It uses sudo where needed."

cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)
[ -f docker-compose.yml ] || die "docker-compose.yml not found. Run this from the repository root."

# --- detect the distribution ---
if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    DISTRO_ID="${ID:-unknown}"
else
    die "Cannot identify the operating system: /etc/os-release is missing."
fi
log "Detected $DISTRO_ID"

# --- swap ---
#
# `next build` and `vite build` each peak above 1 GB. A modest swap file keeps
# builds reliable on small EC2 instances, but must never consume the disk space
# needed for Docker images. Reserve 3 GB for images/data and cap the swap at 1 GB
# on normal small hosts (2 GB only on hosts with less than 1 GB RAM).
TOTAL_MEM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
AVAILABLE_DISK_MB=$(df -Pm / | awk 'NR==2 {print $4}')
log "Memory: ${TOTAL_MEM_MB} MB; free root disk: ${AVAILABLE_DISK_MB} MB"

if [ "$TOTAL_MEM_MB" -lt 3800 ] && [ ! -f /swapfile ]; then
    SWAP_MB=1024
    if [ "$TOTAL_MEM_MB" -lt 1024 ]; then
        SWAP_MB=2048
    fi
    MAX_SWAP_MB=$((AVAILABLE_DISK_MB - 3072))
    if [ "$MAX_SWAP_MB" -lt 512 ]; then
        warn "Not creating swap: reserve disk space for Docker images (only ${AVAILABLE_DISK_MB} MB free)."
    else
        if [ "$SWAP_MB" -gt "$MAX_SWAP_MB" ]; then
            SWAP_MB=$MAX_SWAP_MB
        fi
        log "Adding ${SWAP_MB} MB swap so frontend builds are not OOM-killed"
        sudo fallocate -l "${SWAP_MB}M" /swapfile 2>/dev/null || \
            sudo dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_MB" status=none
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile >/dev/null
        sudo swapon /swapfile
        grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
        log "Swap active: $(free -h | awk '/Swap/ {print $2}')"
    fi
elif [ -f /swapfile ]; then
    log "Swap file already present"
else
    log "Enough memory that swap is not needed"
fi

# --- Docker ---
if command -v docker >/dev/null 2>&1; then
    log "Docker already installed: $(docker --version)"
else
    log "Installing Docker"
    case "$DISTRO_ID" in
        amzn)
            sudo dnf install -y docker
            ;;
        ubuntu|debian)
            sudo apt-get update -qq
            sudo apt-get install -y -qq ca-certificates curl gnupg
            sudo install -m 0755 -d /etc/apt/keyrings
            curl -fsSL "https://download.docker.com/linux/${DISTRO_ID}/gpg" \
                | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            sudo chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${DISTRO_ID} $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
                | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
            sudo apt-get update -qq
            sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io
            ;;
        *)
            die "Unsupported distribution '$DISTRO_ID'. Install Docker manually, then re-run."
            ;;
    esac
fi

sudo systemctl enable --now docker

# --- compose plugin ---
if sudo docker compose version >/dev/null 2>&1; then
    log "Docker Compose available"
else
    log "Installing the Docker Compose plugin"
    COMPOSE_VERSION=v2.29.7
    ARCH=$(uname -m)
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -fsSL \
        "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${ARCH}" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# --- run docker without sudo, from this point on ---
if ! groups | grep -qw docker; then
    log "Adding $USER to the docker group"
    sudo usermod -aG docker "$USER"
    warn "Group membership applies to new logins, so this run uses sudo for docker."
    warn "Log out and back in afterwards to use docker without it."
fi

chmod +x deploy/*.sh 2>/dev/null || true

# sudo is used for this run because the group change has not taken effect in the
# current shell. Later invocations by the operator will not need it.
DOCKER="sudo docker"
if docker info >/dev/null 2>&1; then
    DOCKER="docker"
fi

# --- build and start ---
# Build each image in sequence. Building the Go API and both Node frontends in
# parallel can exceed the small root volume on entry-level EC2 instances even
# though the final runtime images are compact. Removing BuildKit's temporary
# cache after each image keeps the completed image and frees compiler/dependency
# layers before the next build begins.
log "Building API image"
$DOCKER compose build api
$DOCKER builder prune -af

log "Building dashboard image"
$DOCKER compose build app
$DOCKER builder prune -af

log "Building landing-page image"
$DOCKER compose build landing
$DOCKER builder prune -af

log "Pulling runtime images and starting the stack"
$DOCKER compose up -d --no-build

log "Waiting for the API to report ready"
READY=0
for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 http://localhost/readyz 2>/dev/null | grep -q '"status":"ready"'; then
        READY=1
        break
    fi
    sleep 5
done

echo ""
if [ "$READY" -eq 1 ]; then
    log "Stack is up."
else
    warn "The API did not report ready within five minutes."
    warn "Check the logs:  $DOCKER compose logs api"
fi

# Retrieve the public address through IMDSv2 when it is enabled, falling back to
# IMDSv1 for older Amazon Linux images. This is informational only; certificate
# issuance below has its own public HTTP challenge check.
IMDS_TOKEN=$(curl -fsS --max-time 3 -X PUT \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60" \
    http://169.254.169.254/latest/api/token 2>/dev/null || true)
if [ -n "$IMDS_TOKEN" ]; then
    PUBLIC_IP=$(curl -fsS --max-time 5 \
        -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
        http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
else
    PUBLIC_IP=$(curl -fsS --max-time 5 \
        http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
fi
[ -n "$PUBLIC_IP" ] || PUBLIC_IP="<instance-ip>"

# A new clone is usable on HTTP immediately. If DNS is already present, complete
# the TLS cutover now rather than requiring an operator to edit nginx afterward.
# init-letsencrypt.sh performs a public challenge preflight, so a stale DNS record
# cannot accidentally obtain a certificate for this host.
PRIMARY_DOMAIN="${CERTBOT_PRIMARY_DOMAIN:-utilipayhub.com}"
if [ "$READY" -eq 1 ] && getent ahostsv4 "$PRIMARY_DOMAIN" >/dev/null 2>&1; then
    log "DNS found for $PRIMARY_DOMAIN; attempting automatic TLS provisioning"
    if ! DOCKER="$DOCKER" CERTBOT_EMAIL="${CERTBOT_EMAIL:-adminutilihub@gmail.com}" \
        CERTBOT_DOMAINS="${CERTBOT_DOMAINS:-utilipayhub.com}" ./deploy/init-letsencrypt.sh; then
        warn "TLS was not activated. HTTP remains available; check DNS and port 80, then re-run ./deploy/init-letsencrypt.sh."
    fi
else
    warn "DNS for $PRIMARY_DOMAIN is not available yet; serving HTTP until TLS can be issued."
fi

echo ""
echo "  Landing page:  http://${PUBLIC_IP}/"
echo "  Dashboard:     http://${PUBLIC_IP}/app/"
echo "  Health:        http://${PUBLIC_IP}/readyz"
echo ""
echo "  Admin:     adminutilihub@gmail.com / utilihub@admin"
echo "  Retailer:  retailer.demo@gmail.com / demo@retailer"
echo ""
echo "  Verify every route:   ./deploy/verify-routes.sh"
echo "  Follow the API log:   $DOCKER compose logs -f api"
echo ""
warn "Before real retailers use this:"
warn "  1. Change both passwords from the app's Settings screen."
warn "  2. Move KYC documents to S3. Create a bucket with public access blocked,"
warn "     attach an instance role, then in $REPO_ROOT/.env set:"
warn "       STORAGE_DRIVER=s3"
warn "       S3_BUCKET=your-bucket"
warn "       S3_REGION=ap-south-1"
warn "     and run: $DOCKER compose up -d"
warn "     Until then uploads live on this instance and are lost if it is replaced."
warn "  3. If DNS was not ready during bootstrap, run ./deploy/init-letsencrypt.sh."
