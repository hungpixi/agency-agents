# syntax=docker/dockerfile:1.7
ARG BUN_IMAGE=oven/bun:1.3.2-alpine
ARG NINE_ROUTER_REPO=https://github.com/decolua/9router.git
ARG NINE_ROUTER_BRANCH=master

FROM ${BUN_IMAGE} AS source
WORKDIR /src
RUN apk --no-cache add git
RUN git clone --depth 1 --branch "${NINE_ROUTER_BRANCH}" "${NINE_ROUTER_REPO}" .

FROM ${BUN_IMAGE} AS builder
WORKDIR /app
RUN apk --no-cache upgrade && apk --no-cache add nodejs npm python3 make g++ linux-headers
COPY --from=source /src/package.json ./
RUN --mount=type=cache,target=/root/.npm npm install
COPY --from=source /src ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ${BUN_IMAGE} AS runner
WORKDIR /app

LABEL org.opencontainers.image.title="agency-9router"

ENV NODE_ENV=production
ENV PORT=20128
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/open-sse ./open-sse
COPY --from=builder /app/src/mitm ./src/mitm
COPY --from=builder /app/node_modules/node-forge ./node_modules/node-forge
COPY apps/9router/entrypoint.sh /entrypoint.sh

RUN mkdir -p /app/data && chown -R bun:bun /app && \
  apk --no-cache upgrade && apk --no-cache add su-exec && \
  chmod +x /entrypoint.sh

EXPOSE 20128

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "server.js"]
