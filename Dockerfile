# syntax=docker/dockerfile:1
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies only, from the lockfile, as a cacheable layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY knexfile.js ./
COPY src ./src
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

# Run as the unprivileged user that ships with the official image.
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/api/health" > /dev/null || exit 1

CMD ["sh", "scripts/docker-entrypoint.sh"]
