# The dashboard is a static bundle. It is built here and copied into the nginx
# image at compose build time, so nothing about this stage needs to run in
# production.

# --- dependencies ---
FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The sub-path the app is served under. It has to be known at build time because
# Vite rewrites every asset URL with it, and React Router reads it back as its
# basename. Overridable so a subdomain deployment can build with APP_BASE_PATH=/.
ARG APP_BASE_PATH=/app/
ENV APP_BASE_PATH=$APP_BASE_PATH

# Empty means same-origin: nginx serves this bundle and proxies /api to the API on
# the same host, so there is no cross-origin request and no CORS preflight.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# --- runtime ---
FROM nginx:1.27-alpine AS runtime

# The dashboard's own server block: it serves the bundle and falls back to
# index.html so client-side routes survive a page refresh.
COPY docker/nginx-app.conf /etc/nginx/conf.d/default.conf

# Into an /app subdirectory, matching the path the proxy forwards, so nginx can
# use `root` and a try_files fallback that behaves predictably.
COPY --from=build /app/dist /usr/share/nginx/html/app

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
