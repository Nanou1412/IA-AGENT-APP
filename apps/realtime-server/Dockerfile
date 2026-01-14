# Dockerfile for OpenAI Realtime Voice Server
# Optimized for Railway deployment
# NOTE: This builds from the repo root context (monorepo)

FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally (for monorepo compatibility)
RUN npm install -g pnpm

# Copy workspace configuration
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy the realtime-server package
COPY apps/realtime-server ./apps/realtime-server

WORKDIR /app/apps/realtime-server

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build TypeScript
RUN pnpm build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files for production install
COPY --from=builder /app/apps/realtime-server/package.json ./

# Install production dependencies only (npm for simpler standalone install)
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /app/apps/realtime-server/dist ./dist

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
