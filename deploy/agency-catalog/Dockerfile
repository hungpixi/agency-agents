FROM alpine:3.20

RUN apk add --no-cache bash git jq curl

WORKDIR /app
COPY deploy/agency-catalog/sync.sh /app/sync.sh
RUN chmod +x /app/sync.sh

CMD ["/bin/bash", "-lc", "while true; do /app/sync.sh; sleep ${AGENCY_SYNC_INTERVAL_SECONDS:-3600}; done"]
