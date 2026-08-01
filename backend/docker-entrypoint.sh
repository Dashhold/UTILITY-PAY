#!/bin/sh
# Prepares the environment, then hands off to the API.
#
# The one thing this does is make the deployment work on a bare `git clone` without
# the operator generating a signing key by hand, while still not shipping one in the
# image. A JWT secret committed to a repository would let anyone who can read the
# source mint an admin session against a live server, so it is generated here on
# first boot and kept on the data volume.

set -eu

SECRET_FILE="${JWT_SECRET_FILE:-/app/data/jwt-secret}"

if [ -z "${JWT_SECRET:-}" ]; then
    if [ -f "$SECRET_FILE" ]; then
        JWT_SECRET=$(cat "$SECRET_FILE")
        echo "entrypoint: reusing the JWT secret from $SECRET_FILE"
    else
        mkdir -p "$(dirname "$SECRET_FILE")"

        # 48 bytes from the kernel CSPRNG. base64 so it survives being passed
        # through the environment, then stripped of newlines.
        JWT_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n')

        # Written with a restrictive mode before the value goes in, so it is never
        # briefly world-readable.
        umask 077
        printf '%s' "$JWT_SECRET" > "$SECRET_FILE"

        echo "entrypoint: generated a new JWT secret at $SECRET_FILE"
        echo "entrypoint: it persists on the data volume, so sessions survive a restart."
        echo "entrypoint: deleting that file or the volume signs every user out."
    fi
    export JWT_SECRET
else
    echo "entrypoint: using the JWT_SECRET supplied by the environment"
fi

exec /app/api "$@"
