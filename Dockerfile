# ---- Build stage: compile the React app to static files ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* vars into the bundle AT BUILD TIME (runtime env cannot change them).
# Pass the production API URL here, e.g.:
#   docker build --build-arg VITE_API_URL=https://legal-analyzer.lintasarta.dev .
ARG VITE_API_URL=https://legal-analyzer.lintasarta.dev
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---- Serve stage: production static server (no Vite dev server, no HMR websocket) ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
