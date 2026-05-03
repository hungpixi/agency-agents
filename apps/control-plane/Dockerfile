FROM node:24-bookworm-slim

WORKDIR /app
COPY apps/control-plane/package.json /app/package.json
COPY apps/control-plane/src /app/src

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
