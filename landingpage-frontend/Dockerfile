# --- dependencies ---
FROM node:22-alpine AS deps

WORKDIR /app

# The lockfile is copied on its own so a source change does not invalidate the
# install layer.
COPY package.json package-lock.json ./
# npm ci installs exactly what the lockfile pins, which is what makes an image
# reproducible.
RUN npm ci

# --- build ---
FROM node:22-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Links into the dashboard are same-origin relative paths by default, so no
# NEXT_PUBLIC_* build arguments are needed here. Passing an absolute URL would
# bake it into the bundle, which is how a production build ends up pointing at
# localhost.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime ---
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs

# The standalone output carries only the node_modules the app actually reaches,
# so the runtime image stays small and has less to patch.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Unprivileged: a compromise in the render path cannot write to the image.
USER nextjs

EXPOSE 3000

# node is used directly rather than wget so the image needs no extra packages.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
