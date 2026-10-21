# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

# Static ffmpeg/ffprobe 9.0.2 (musl, amd64 + arm64). Alpine's ffmpeg package was older than 8.0
# and could not decode animated WebP (WAN's clip format). Pinned tag + digest — bump both together.
FROM mwader/static-ffmpeg:9.0.2@sha256:7d9bdaaf887f7e6ce6151f67325c344074b5ff1fb75316011c3376503e449a7b AS ffmpeg

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
# Full install: Next build needs TypeScript. HUSKY=0 skips the prepare hook
# (husky is a devDependency and is not on PATH with a partial install).
ENV HUSKY=0
RUN npm ci

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=47832
# Auth is runtime-only — do not bake PROMPT_AUTH_ENABLED into the image.
# For non-LAN publish use compose --profile exposed or pass -e PROMPT_AUTH_ENABLED=true.
ENV HOSTNAME=0.0.0.0

# Server film Cut (H.264/AAC) — browser MediaRecorder remains the fallback.
# font-dejavu: drawtext needs a font file for Cut title cards and captions.
RUN apk add --no-cache font-dejavu \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data && chown nextjs:nodejs /data

# Static ffmpeg (libx264, aac, libwebp + animated WebP decode, drawtext/freetype, xfade).
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg

# Server storage (Cast, gallery, settings, gallery-media originals). Mount a volume here.
ENV PROMPT_DATA_DIR=/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 47832

CMD ["node", "server.js"]
