FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY .env.production.example ./.env.production.example

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    COPARENTES_DB_PATH=/var/lib/coparentes/coparentes.db \
    COPARENTES_SEED_DEMO_DATA=false \
    COPARENTES_TRUST_PROXY=true \
    COPARENTES_JSON_LIMIT=1mb

RUN mkdir -p /var/lib/coparentes

EXPOSE 4000

CMD ["npm", "start"]
