FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all source files
COPY . .

# Expose Vite's default dev port
EXPOSE 5173

# Run the dev server and expose it on the host network
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
