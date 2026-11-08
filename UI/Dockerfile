FROM node:24.22.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# rewrites are baked in at build time, so the api address has to be known here
ARG API_ORIGIN=http://api:8080
ARG SITE_URL
ARG SITE_INDEXING
ENV API_ORIGIN=$API_ORIGIN NEXT_TELEMETRY_DISABLED=1
# Bos build argumanlari .env.production degerlerini ezmesin.
RUN [ -n "$SITE_URL" ] || unset SITE_URL; [ -n "$SITE_INDEXING" ] || unset SITE_INDEXING; npm run build && npm prune --omit=dev

FROM node:24.22.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 UI_HOST=0.0.0.0
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/tools/*.mjs ./tools/
USER node
EXPOSE 3100
CMD ["node", "tools/server.mjs", "--port", "3100"]
