# --- build stage ---
FROM golang:1.25-alpine AS build

WORKDIR /src

# Dependencies are copied first so a code-only change does not invalidate the
# module download layer.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO is disabled to produce a static binary that runs on a scratch-like base.
# Symbols and DWARF are stripped to keep the image small.
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/api ./cmd/api

# --- runtime stage ---
FROM alpine:3.20

# ca-certificates is required for outbound TLS to the provider APIs; tzdata so
# Asia/Kolkata resolves for report boundaries.
RUN apk add --no-cache ca-certificates tzdata wget \
    && addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=build /out/api /app/api
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# The data directory holds the generated JWT secret and, when STORAGE_DRIVER=local,
# the KYC uploads. Created with the right ownership so the unprivileged user can
# write to it.
RUN chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /app/data/uploads \
    && chown -R app:app /app/data

# Running unprivileged limits the blast radius of a container compromise.
USER app

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD wget --quiet --tries=1 -O /dev/null http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
