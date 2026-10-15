# Glama / catalog image: stdio MCP over local bundled snapshot (Zero-Network).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY data ./data
COPY openapi ./openapi
COPY dist ./dist
COPY README.md LICENSE ./
RUN npm ci --omit=dev --ignore-scripts \
  && chmod +x dist/index.js
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/index.js"]
