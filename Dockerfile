# Use official Node.js Slim image for full glibc dual-stack IP support
FROM node:20-slim

# Set the working directory
WORKDIR /app


# Declare the build argument for the private registry access token
ARG NPM_TOKEN
ENV NPM_TOKEN=$NPM_TOKEN

# Copy package runtimes and registry configurations to install dependencies
COPY package*.json ./
COPY .npmrc ./

# Install only production dependencies
# This automatically respects NODE_ENV=production
RUN npm ci --omit=dev && npm cache clean --force

# Securely remove the .npmrc file after installation so that tokens are not stored in the image
RUN rm -f .npmrc

# Copy the application source code
COPY . .

# Ensure the non-root 'node' user owns the application files
RUN chown -R node:node /app

# Use unprivileged user for security
USER node

# Expose typical backend port. This can be mapped at runtime.
EXPOSE 5001

# Run the backend using the package.json start script
CMD ["npm", "start"]
