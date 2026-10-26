FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY services ./services
RUN npm ci --ignore-scripts
RUN npm run build:integration
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/integration/dist ./services/integration/dist
COPY --from=build /app/services/integration/contracts ./services/integration/contracts
COPY --from=build /app/services/integration/migrations ./services/integration/migrations
COPY --from=build /app/services/integration/package.json ./services/integration/package.json
WORKDIR /app/services/integration
USER node
EXPOSE 3010
CMD ["node", "dist/main.js"]
