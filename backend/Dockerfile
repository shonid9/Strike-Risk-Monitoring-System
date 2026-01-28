FROM node:20-alpine
WORKDIR /app

# Copy backend files
COPY backend/package*.json backend/tsconfig.json ./
RUN npm install
COPY backend/src ./src
RUN npm run build

# Copy frontend files to expected location
COPY frontend ./frontend

# Expose port
EXPOSE 4000

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/index.js"]
