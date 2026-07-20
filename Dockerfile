ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json tsconfig.json ./

FROM base AS deps
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS backend-builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY apps ./apps
COPY packages ./packages
RUN pnpm --filter @interview-assistant/shared build
RUN pnpm --filter @interview-assistant/backend build

FROM base AS frontend-builder
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY apps ./apps
COPY packages ./packages
RUN pnpm --filter @interview-assistant/shared build
RUN pnpm --filter @interview-assistant/frontend build

FROM node:${NODE_VERSION}-alpine AS backend
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Install Claude Code CLI globally → /usr/local/bin/claude
RUN npm install -g @anthropic-ai/claude-code

# Ensure ~/.claude dir exists for credential mount
RUN mkdir -p /home/node/.claude && chown 1000:1000 /home/node/.claude
ENV HOME=/home/node

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --prod --frozen-lockfile
COPY --from=backend-builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=backend-builder /app/packages/shared/dist ./packages/shared/dist
COPY apps/backend/migrate-and-start.sh ./apps/backend/
COPY apps/backend/public/templates ./apps/backend/public/templates
RUN chmod +x ./apps/backend/migrate-and-start.sh
RUN mkdir -p /app/apps/backend/uploads && chown -R 1000:1000 /app/apps/backend/uploads
EXPOSE 3000
WORKDIR /app/apps/backend
CMD ["./migrate-and-start.sh"]

FROM node:${NODE_VERSION}-alpine AS cv-sanitizer-worker
WORKDIR /app
RUN apk add --no-cache ghostscript
COPY apps/cv-sanitizer/worker.js ./worker.js
CMD ["node", "worker.js"]

FROM nginx:alpine AS frontend
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
