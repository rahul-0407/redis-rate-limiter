FROM node:20-slim
WORKDIR /app
COPY services/backend-service/package*.json ./
RUN npm ci --omit=dev
COPY services/backend-service/src ./src

COPY proto/ratelimit.proto ./proto/ratelimit.proto
ENV PROTO_PATH=/app/proto/ratelimit.proto

EXPOSE 3000
CMD ["node", "src/index.js"]