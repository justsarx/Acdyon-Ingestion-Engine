# ==============================================================================
# Multi-Stage Production Dockerfile for Acdyon Ingestion Engine
# Security Hardened: Non-root user execution, minimal attack surface
# ==============================================================================

# Stage 1: Build & TypeScript Compilation
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json tsconfig.json ./

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy source code
COPY src/ ./src/

# Compile TypeScript to /app/dist
RUN npm run build

# Prune devDependencies for minimal runtime image
RUN npm prune --production

# ==============================================================================
# Stage 2: Minimal Production Runtime
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dumb-init for proper signal forwarding and PID 1 zombie reaping
RUN apk add --no-cache dumb-init

# Copy node_modules and compiled JavaScript from builder
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/package.json ./package.json

# Copy documentation
COPY --chown=node:node DECISIONS.md README.md ./

# Switch to non-privileged node user for security
USER node

EXPOSE 3000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
