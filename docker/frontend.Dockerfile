# Front Lovable (TanStack Start + Nitro) : build puis serveur Node.
# Contexte de build = frontend/ (clone de Luka-codeur/bytesec-client-compass) :
#   docker build -f docker/frontend.Dockerfile frontend
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .

# Variables VITE_ figées dans le bundle au build : URL publiques vues par le navigateur.
ARG VITE_USE_MOCK=false
ARG VITE_API_URL=
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=crm
ARG VITE_KEYCLOAK_CLIENT_ID=crm-frontend
ENV VITE_USE_MOCK=$VITE_USE_MOCK VITE_API_URL=$VITE_API_URL VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
