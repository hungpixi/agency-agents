FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git jq \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY apps/control-plane/package.json /app/package.json
COPY apps/control-plane/src /app/src

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
