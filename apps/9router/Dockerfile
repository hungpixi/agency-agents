FROM node:20-bookworm-slim

ARG NINE_ROUTER_VERSION=0.4.12

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && npm install -g "9router@${NINE_ROUTER_VERSION}" \
  && npm cache clean --force

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=20128
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data

COPY apps/9router/entrypoint.sh /entrypoint.sh

RUN mkdir -p /app/data \
  && chmod +x /entrypoint.sh

EXPOSE 20128

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "/usr/local/lib/node_modules/9router/app/server.js"]
