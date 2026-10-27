FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@11.18.0

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3030
CMD ["node", "dist/index.js"]
