# Multi-stage build for sqg tool
FROM node:24-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# Set working directory
WORKDIR /workspace

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY sqg/package.json ./sqg/
COPY sqg/tsconfig.json ./sqg/
COPY sqg/src ./sqg/src
COPY sqg/sqg ./sqg/sqg
COPY sqg/biome.json ./sqg/

# Install dependencies at workspace root (required for pnpm workspaces)
RUN pnpm install --frozen-lockfile --filter sqg
RUN (cd sqg && pnpm build)
# Create a deployable standalone installation
RUN pnpm --filter sqg --prod deploy /app-deploy 

# Final runtime image
FROM node:24-slim

# Create non-root user for security
RUN useradd -m -u 1010 sqg && \
    mkdir -p /app /tmp/sqg && \
    chown -R sqg:sqg /app /tmp/sqg

# Copy deployed application from builder
COPY --from=builder /app-deploy/dist /app/dist
COPY --from=builder /app-deploy/node_modules /app/node_modules

# Set working directory
WORKDIR /app

# Switch to non-root user
USER sqg

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/app/sqg/node_modules/.bin:$PATH"

# Entrypoint
ENTRYPOINT ["node", "/app/dist/sqg.mjs"]

