# Glama / catalog image: stdio MCP over local bundled snapshot (Zero-Network).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY data ./data
RUN npm ci \
  && npm run build \
  && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY data ./data
COPY openapi ./openapi
COPY README.md LICENSE ./
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/index.js"]
