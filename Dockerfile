# Dockerfile for OpenAI Realtime Voice Server
# This file is at the root for Railway - it builds apps/realtime-server

FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy the entire monorepo structure needed
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY apps/realtime-server ./apps/realtime-server

# Install dependencies for realtime-server only
WORKDIR /app/apps/realtime-server
RUN pnpm install --frozen-lockfile

# Build TypeScript
RUN pnpm build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY --from=builder /app/apps/realtime-server/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile || npm install --omit=dev

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
