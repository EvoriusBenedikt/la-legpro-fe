# ---- Build stage: compile the React app to static files ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* vars into the bundle AT BUILD TIME (runtime env cannot change them).
# Default is EMPTY: production bundles then use a same-origin relative API base
# (src/config.ts) and nginx.conf reverse-proxies /api/ to the backend. Pass an
# absolute URL only for split-host deployments, e.g.:
#   docker build --build-arg VITE_API_URL=https://api.example.com .
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---- Serve stage: production static server (no Vite dev server, no HMR websocket) ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
