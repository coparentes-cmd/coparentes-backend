ROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    COPARENTES_TRUST_PROXY=true \
    COPARENTES_JSON_LIMIT=1mb

EXPOSE 3000

CMD ["nmp", "start"]
