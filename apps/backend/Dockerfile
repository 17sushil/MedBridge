# MedBridge backend API — self-hosted image (also used by docker-compose).
# Entrypoint supports automatic migration + optional seeding, then runs Express.
FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 4000

# SEED_ON_START=1 seeds the 8 demo hospitals (requires the ML CSVs mounted
# at /app/ml-service/data — see docker-compose.yml). Default: migrate only.
CMD ["sh", "-c", \
     "npx prisma migrate deploy && \
      if [ \"$SEED_ON_START\" = \"1\" ]; then node prisma/seed.js || echo 'seed skipped/failed'; fi && \
      exec node src/index.js"]
