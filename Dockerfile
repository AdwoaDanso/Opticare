# OptiCare Eye Clinic Dockerfile
FROM node:20-alpine

# Install build tools for native SQLite compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["node", "app.js"]
