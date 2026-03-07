FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend ./
RUN npm run build

FROM node:20-alpine AS backend-runtime
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=backend-builder /app/backend/package*.json ./
RUN npm install --omit=dev
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/scripts ./scripts
EXPOSE 4000
CMD ["node", "dist/index.js"]
