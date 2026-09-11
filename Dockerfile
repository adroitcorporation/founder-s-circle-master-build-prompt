FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Frontend/package*.json Frontend/.npmrc ./Frontend/
COPY Backend/package*.json Backend/.npmrc ./Backend/
RUN npm --prefix Frontend ci && npm --prefix Backend ci
COPY . .
RUN npm --prefix Frontend run build && npm --prefix Backend run build
RUN npm --prefix Backend prune --omit=dev

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/Backend/node_modules ./Backend/node_modules
COPY --from=build --chown=node:node /app/Backend/dist ./Backend/dist
COPY --from=build --chown=node:node /app/Backend/prisma ./Backend/prisma
COPY --from=build --chown=node:node /app/Backend/package.json ./Backend/package.json
COPY --from=build --chown=node:node /app/Frontend/dist ./Frontend/dist
USER node
EXPOSE 3001
CMD ["sh", "-c", "cd Backend && npx prisma migrate deploy && npm start"]
