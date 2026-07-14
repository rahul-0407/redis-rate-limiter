# --- build stage: compiles TS -> JS, not shipped in final image ---
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- production stage: only compiled output + prod deps ---
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# gcra.lua is a plain text file — tsc doesn't copy it, do it explicitly.
COPY --from=build /app/src/lib/gcra.lua ./dist/lib/gcra.lua

EXPOSE 3000
CMD ["node", "dist/index.js"]