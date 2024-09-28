# Use Node.js 16 instead of Node.js 18
FROM node:18

WORKDIR /app

# Install necessary dependencies for Puppeteer and Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxss1 \
    libxrandr2 \
    libasound2 \
    libatk1.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium
RUN apt-get update && apt-get install -y chromium

# Create a non-root user
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

# Copy package.json and yarn.lock (if available)
COPY package.json yarn.lock ./

# Install dependencies with Yarn
RUN yarn install

# Install specific version of redis
RUN yarn add redis@3.1.2

# Copy the rest of the app files
COPY . .

# Do not overwrite the credentials file
VOLUME /app/google-credentials.json

# Expose the default port
EXPOSE 3000

# Set necessary environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Switch to non-root user
USER pptruser

# Start the application
CMD ["yarn", "start"]

# Copy .env file
COPY .env .env
