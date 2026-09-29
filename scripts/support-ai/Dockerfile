FROM node@sha256:a0ddbc73510e98f5e824fd64266ffe1c2c343ba9cf260d95ca2985ad632a3f3e
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global --ignore-scripts --no-audit --no-fund @openai/codex@0.158.0 && install -d -o node -g node /work /home/node/.codex
COPY config.toml runtime.mjs worker.mjs /opt/helix/
USER node
WORKDIR /work
ENTRYPOINT ["node", "/opt/helix/worker.mjs"]
