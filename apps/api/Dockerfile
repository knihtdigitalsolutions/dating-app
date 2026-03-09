FROM node:22-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

WORKDIR /app/packages/db
RUN pnpm db:generate

WORKDIR /app
EXPOSE 4000
CMD ["pnpm", "--filter", "@dating/api", "dev"]
