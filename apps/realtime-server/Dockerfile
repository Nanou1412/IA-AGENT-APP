# Dockerfile for OpenAI Realtime Voice Server
# Optimized for Railway deployment
# NOTE: Build from repo ROOT with: docker build -f apps/realtime-server/Dockerfile .

FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the ENTIRE monorepo (required for pnpm workspaces)
COPY . .

# Install ALL dependencies (monorepo)
RUN pnpm install --frozen-lockfile

# Build only the realtime-server workspace
RUN pnpm --filter @repo/realtime-server build

# Verify the build output exists
RUN ls -la /app/apps/realtime-server/dist/

# ============================================================================
# Production image (minimal)
# ============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built dist from builder
COPY --from=builder /app/apps/realtime-server/dist ./dist
COPY --from=builder /app/apps/realtime-server/package.json ./

# Install production dependencies only (standalone, no pnpm needed)
RUN npm install --omit=dev --ignore-scripts

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
USER appuser

# Environment variables (Railway will override PORT)
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
