# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

# Install ffmpeg (needed for transcoding)
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3001

CMD ["node", "dist/main"]
