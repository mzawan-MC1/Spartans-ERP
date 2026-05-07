FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application code
COPY . .

# Build for production (optional - uncomment for production build)
# RUN yarn build

# Expose port
EXPOSE 3000

# Start development server (use 'serve -s build' for production)
CMD ["yarn", "start"]
