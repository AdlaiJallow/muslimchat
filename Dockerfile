# Production image for Hugging Face Spaces (Docker SDK). Also runs on any container host.
FROM node:22-slim

# Hugging Face runs the container as uid 1000, which is the image's "node" user.
USER node
WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time.
# On Spaces, add them as Variables (not Secrets): Variables are passed as build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG EMBEDDING_MODEL=Xenova/multilingual-e5-small
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    EMBEDDING_MODEL=$EMBEDDING_MODEL \
    NEXT_TELEMETRY_DISABLED=1

# Bake the embedding model into the image so a cold start doesn't download it.
RUN npx tsx scripts/warm-model.ts

RUN npm run build

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=7860
EXPOSE 7860

CMD ["npx", "next", "start"]
