#!/bin/bash
# Prepares a fresh EC2 instance to run the UtiliPay Hub stack.
#
# Installs Docker, adds swap so the frontend builds do not run out of memory on a
# small instance, and creates .env from the example if it is missing.
#
# Run once, from the repository root, on the instance:
#
#   chmod +x deploy/ec2-bootstrap.sh
#   ./deploy/ec2-bootstrap.sh
#
# Supports Amazon Linux 2023 and Ubuntu 22.04/24.04.

set -euo pipefail

log()  { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$1"; }
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
# `next build` and `vite build` each peak above 1 GB. On a t3.micro (1 GB) they are
# killed by the OOM reaper partway through, which surfaces as a confusing
# "exit code 137" from Docker rather than an out-of-memory message. 4 GB of swap
# makes the builds complete on the smallest instance types.
TOTAL_MEM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
log "Memory: ${TOTAL_MEM_MB} MB"

if [ "$TOTAL_MEM_MB" -lt 3800 ] && [ ! -f /swapfile ]; then
    log "Adding a 4 GB swap file so the frontend builds do not get OOM-killed"
    sudo fallocate -l 4G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
    sudo swapon /swapfile
    # Persisted so the swap survives a reboot.
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    log "Swap active: $(free -h | awk '/Swap/ {print $2}')"
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
if docker compose version >/dev/null 2>&1; then
    log "Docker Compose available: $(docker compose version --short)"
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

# --- run docker without sudo ---
if ! groups | grep -qw docker; then
    log "Adding $USER to the docker group"
    sudo usermod -aG docker "$USER"
    NEEDS_RELOGIN=1
else
    NEEDS_RELOGIN=0
fi

# --- configuration ---
if [ ! -f .env ]; then
    log "Creating .env from .env.example"
    cp .env.example .env

    # Generated here rather than left blank: a deployment that starts with an empty
    # JWT secret fails to boot, and one with a guessable password is worse.
    DB_PASS=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
    JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')

    # Portable in-place edit: BSD and GNU sed disagree on -i.
    tmp=$(mktemp)
    sed -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASS}|" \
        -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" \
        .env > "$tmp" && mv "$tmp" .env
    chmod 600 .env

    warn ".env was created with a generated database password and JWT secret."
    warn "You still MUST fill in before going live:"
    warn "  S3_BUCKET / S3_REGION   where KYC documents are stored"
    warn "  BC_CLIENT_ID / BC_CLIENT_SECRET / BC_PUBLIC_KEY_BASE64"
    warn "  CERTBOT_EMAIL           for certificate expiry notices"
    warn "  SEED_ADMIN_PASSWORD     change before the first boot"
else
    log ".env already exists; leaving it untouched"

    # A .env carried over from a laptop is the likeliest way a development
    # configuration reaches a server, and both of these are silently damaging:
    # development mode relaxes checks, and local storage loses every uploaded KYC
    # document on the next release.
    if grep -qE '^APP_ENV=development' .env; then
        warn "APP_ENV=development in .env. Set APP_ENV=production before going live."
    fi
    if grep -qE '^STORAGE_DRIVER=local' .env; then
        warn "STORAGE_DRIVER=local in .env. KYC uploads will be LOST on the next"
        warn "release because the container filesystem is discarded. Set it to s3."
    fi
    if grep -qE '^(DB_PASSWORD|JWT_SECRET)=$' .env; then
        die "DB_PASSWORD or JWT_SECRET is empty in .env. The stack will not start."
    fi
fi

chmod +x deploy/*.sh 2>/dev/null || true

echo ""
log "Instance is ready."
echo ""
if [ "$NEEDS_RELOGIN" -eq 1 ]; then
    echo "  1. Log out and back in (or run: newgrp docker) so docker works without sudo"
    echo "  2. Edit .env and fill in the values listed above"
    echo "  3. cd $REPO_ROOT && docker compose --env-file .env up -d --build"
else
    echo "  1. Edit .env and fill in the values listed above"
    echo "  2. cd $REPO_ROOT && docker compose --env-file .env up -d --build"
fi
echo ""
echo "  The first build takes 5-10 minutes. Then check it:"
echo "     ./deploy/verify-routes.sh"
echo ""
echo "  Once DNS points here, issue the TLS certificate:"
echo "     ./deploy/init-letsencrypt.sh"
