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

# Create uploads directory and set permissions
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Create a non-root user and switch to it
USER node

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000

# Start the application
CMD ["node", "server.js"]
