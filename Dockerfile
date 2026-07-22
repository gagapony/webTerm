# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go-server/go.mod go-server/go.sum ./
RUN go mod download
COPY go-server/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -trimpath -o /webterm .

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /webterm /webterm
ENV PORT=8008 \
    HOST=0.0.0.0 \
    DB_PATH=/data/webterm.db \
    LOG_DIR=/data/logs \
    LOG_LEVEL=warn
VOLUME ["/data"]
EXPOSE 8008
ENTRYPOINT ["/webterm"]
