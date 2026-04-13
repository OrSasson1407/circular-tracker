# ─── Build Stage ─────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY shared/ ./shared/
COPY server/package.json ./server/
COPY package.json ./

WORKDIR /app/server
RUN npm install --legacy-peer-deps

COPY server/ ./

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

# ─── Production Stage ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/generated ./generated
COPY --from=builder /app/server/prisma ./prisma

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --schema=./prisma/schema.prisma && node dist/index.js"]