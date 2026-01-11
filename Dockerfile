# Dockerfile for OpenAI Realtime Voice Server
# This file is at the root for Railway - it builds apps/realtime-server

FROM node:20-alpine AS builder

WORKDIR /app

# Copy the realtime-server files only
COPY apps/realtime-server/package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY apps/realtime-server/src ./src
COPY apps/realtime-server/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
USER appuser

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
