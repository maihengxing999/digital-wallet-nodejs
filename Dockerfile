# Use the official Node.js 20 Alpine image as the base
FROM --platform=$TARGETPLATFORM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Create a non-root user and switch to it
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000

# Start the application
CMD ["node", "server.js"]
