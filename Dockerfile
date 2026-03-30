FROM node:22-alpine

# Install all required system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    bash \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    build-base

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy application source
COPY . .

# Set environment
ENV NODE_ENV=production

# Start the bot
CMD ["node", "index.js"]
