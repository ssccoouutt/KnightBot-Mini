FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (npm will generate lockfile internally)
RUN npm install

# Copy rest of the application
COPY . .

# Start the bot
CMD ["node", "index.js"]
