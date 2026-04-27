FROM node:22-slim

# Install Chromium and fonts for Puppeteer PDF generation
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  fonts-noto-color-emoji \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# Create uploads directory
RUN mkdir -p uploads

COPY eslint.config.mjs ./
COPY src/ ./src/

EXPOSE 4000

CMD ["node", "src/index.js"]
