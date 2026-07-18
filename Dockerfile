FROM node:20-bookworm

WORKDIR /app

# Install dependencies and generate Prisma client as root (needs write to node_modules).
COPY package*.json ./
RUN npm install

COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts

RUN npx prisma generate

# Drop root: dedicated unprivileged user for the running process.
# Ports below 1024 are privileged; this app listens on 3000 (safe for non-root).
RUN groupadd -r appuser \
  && useradd -r -g appuser -d /app -s /usr/sbin/nologin appuser \
  && chown -R appuser:appuser /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

USER appuser

CMD ["npm", "start"]
