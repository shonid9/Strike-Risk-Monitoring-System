# Dockerfile for building from project root
FROM node:20-alpine
WORKDIR /app

# Copy backend files
COPY backend/package*.json backend/tsconfig.json ./backend/
WORKDIR /app/backend
RUN npm install
COPY backend/src ./src
RUN npm run build

# Copy frontend files to expected location (relative to backend)
WORKDIR /app
COPY frontend ./frontend

# Back to backend directory for runtime
WORKDIR /app/backend

# Expose port
EXPOSE 4000

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/index.js"]
