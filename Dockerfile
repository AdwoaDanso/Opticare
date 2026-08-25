# OptiCare Eye Clinic Production Dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

# Install build dependencies for native C++ addons (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install npm dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "app.js"]
