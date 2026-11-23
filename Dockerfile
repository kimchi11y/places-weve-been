# The site for your own server. compose.yaml runs it behind Tailscale.
FROM node:26-trixie-slim AS packages
WORKDIR /app
COPY package.json package-lock.json ./

FROM packages AS build
RUN npm ci
COPY . .
RUN npm run build:node

# Only what runs the site: no build tools, nothing for Cloudflare, nothing that's already in dist-node
FROM packages AS runtime-packages
RUN npm ci --omit=dev \
  && npm uninstall --no-save --omit=dev @astrojs/cloudflare heic-to exifr world-atlas @astrojs/react i18n-iso-countries

FROM node:26-trixie-slim
WORKDIR /app
ENV NODE_ENV=production ASTRO_TELEMETRY_DISABLED=1 DATA_DIR=/data HOST=127.0.0.1 PORT=4321
COPY --from=runtime-packages /app/node_modules ./node_modules
COPY --from=build /app/dist-node ./dist-node
COPY package.json ./
COPY migrations ./migrations
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
# Any answer means it's up: without signing in, the right answer is 403 (or 503 before it's set up)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD ["node", "-e", "fetch(`http://${process.env.HOST}:${process.env.PORT}/`).then((r) => process.exit([200, 403, 503].includes(r.status) ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist-node/server/entry.mjs"]
