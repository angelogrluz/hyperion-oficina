FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node scripts/ensure-env.mjs && npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=43123
ENV HOSTNAME=0.0.0.0
EXPOSE 43123

CMD ["sh", "-c", "node scripts/ensure-env.mjs && npx prisma migrate deploy && npx tsx prisma/seed.ts && npm start"]
