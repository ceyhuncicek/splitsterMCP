# Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /

# Copy dependency definitions
COPY package*.json ./

# Install deps
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose the port your Express app listens on
EXPOSE 3000

# Start the app
CMD ["node", "splitser.js"]
