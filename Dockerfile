FROM node:22-alpine

# Install git and build tools (required for some npm packages)
RUN apk add --no-cache git python3 make g++ bash

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Start the bot directly
CMD ["node", "index.js"]
