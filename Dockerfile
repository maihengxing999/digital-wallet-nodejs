# Use the official Node.js 20 Alpine image as the base
FROM node:20-alpine

# Install bash
RUN apk add --no-cache bash

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Create a volume for uploads
VOLUME /app/uploads

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Change ownership of the app directory to the non-root user
RUN chown -R nodejs:nodejs /app

# Change the shell for the non-root user to bash
RUN sed -i 's|/bin/ash|/bin/bash|' /etc/passwd

# Switch to non-root user
USER nodejs

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000

# Start the application (can be overridden)
CMD ["node", "server.js"]
