FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    HOME=/tmp

WORKDIR /app

# Dependencies are pinned by package-lock.json; browsers come from the image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY src/ ./src/
COPY runner/ ./runner/

# Non-root, and the container is also started with --read-only --cap-drop ALL.
USER pwuser

EXPOSE 8080
CMD ["node", "runner/runner.mjs"]
