FROM node:22-bullseye

# Install build tools and canvas dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Start the bot
CMD ["node", "index.js"]
