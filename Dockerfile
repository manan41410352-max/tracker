FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-pip python3-venv \
    && python3 -m pip install --no-cache-dir playwright==1.52.0 \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_LOCAL_USER_NAME
ARG NEXT_PUBLIC_LOCAL_USER_EMAIL
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_LOCAL_USER_NAME=$NEXT_PUBLIC_LOCAL_USER_NAME
ENV NEXT_PUBLIC_LOCAL_USER_EMAIL=$NEXT_PUBLIC_LOCAL_USER_EMAIL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_LOCAL_USER_NAME
ARG NEXT_PUBLIC_LOCAL_USER_EMAIL
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_LOCAL_USER_NAME=$NEXT_PUBLIC_LOCAL_USER_NAME
ENV NEXT_PUBLIC_LOCAL_USER_EMAIL=$NEXT_PUBLIC_LOCAL_USER_EMAIL
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
