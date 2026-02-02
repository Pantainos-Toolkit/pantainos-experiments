FROM node:22-alpine

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Default command runs tests
CMD ["npm", "test"]
