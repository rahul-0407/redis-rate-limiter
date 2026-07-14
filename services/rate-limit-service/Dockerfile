FROM node:20-slim
WORKDIR /app
COPY services/rate-limit-service/package*.json ./
RUN npm ci --omit=dev
COPY services/rate-limit-service/src ./src

COPY proto/ratelimit.proto ./proto/ratelimit.proto
ENV PROTO_PATH=/app/proto/ratelimit.proto

EXPOSE 50051
CMD ["node", "src/server.js"]