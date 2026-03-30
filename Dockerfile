FROM node:18-alpine

# Install git and other build dependencies
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the application
COPY . .

# Start the bot
CMD ["node", "index.js"]
