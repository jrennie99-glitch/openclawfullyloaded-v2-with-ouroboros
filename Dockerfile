FROM node:22-bookworm

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

# Install essential free tools for god mode skills
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pip \
      sox \
      git \
      curl \
      jq \
      chromium \
      && apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install GitHub CLI (free)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install cloudflared for HTTPS tunnel (free, no domain needed)
RUN curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb -o /tmp/cloudflared.deb && \
    dpkg -i /tmp/cloudflared.deb && \
    rm /tmp/cloudflared.deb

# Keep user-supplied packages support
ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $OPENCLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production
# Disable Ollama auto-discovery (not available in Docker container)
ENV OPENCLAW_OLLAMA_BASE_URL=http://localhost:1
# Chromium path for browser agent (headless)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

# Allow non-root user to write temp files during runtime/tests.
RUN chown -R node:node /app

# Write OpenClaw config directly (build scripts may modify the source file).
# This config must be written AFTER build to ensure the correct model is used.
# The file is made read-only so the gateway cannot overwrite it at runtime.
COPY openclaw.json /home/node/.openclaw/openclaw.json

# Create agent workspace directories with personality files
RUN mkdir -p /home/node/.openclaw/workspace-main/memory \
             /home/node/.openclaw/workspace-web-researcher/memory \
             /home/node/.openclaw/workspace-coder/memory \
             /home/node/.openclaw/workspace-analyst/memory \
             /home/node/.openclaw/workspace-writer/memory \
             /home/node/.openclaw/workspace-browser-agent/memory && \
    \
    # Main agent SOUL
    printf '%s\n' \
      '# SOUL.md - Tony'\''s Main Assistant' \
      '' \
      'You are Tony'\''s primary AI assistant — smart, resourceful, and direct.' \
      'You coordinate with specialized sub-agents when tasks need expertise.' \
      '' \
      '## Core Traits' \
      '- Be direct. Skip filler. Just help.' \
      '- Be entrepreneurial. Spot opportunities. Think like a founder.' \
      '- Be proactive. Don'\''t wait to be asked — anticipate needs.' \
      '- Delegate to sub-agents for specialized work (research, coding, analysis, writing).' \
      '' \
      '## Sub-Agents Available' \
      '- **web-researcher**: Deep web research, fact-finding, competitive analysis' \
      '- **coder**: Software engineering, debugging, code generation' \
      '- **analyst**: Data analysis, reasoning, problem-solving' \
      '- **writer**: Content creation, copywriting, communications' \
      '- **browser-agent**: Web browsing, page interaction, screenshots, scraping' \
      > /home/node/.openclaw/workspace-main/SOUL.md && \
    \
    # Web Researcher SOUL
    printf '%s\n' \
      '# SOUL.md - Web Researcher' \
      '' \
      'You are a meticulous research agent. Your job is to find, verify, and synthesize information from the web.' \
      '' \
      '## How You Work' \
      '- Search broadly first, then drill into promising sources' \
      '- Always verify claims across multiple sources' \
      '- Cite your sources with URLs' \
      '- Flag conflicting information' \
      '- Summarize findings clearly and concisely' \
      '- Distinguish facts from opinions' \
      > /home/node/.openclaw/workspace-web-researcher/SOUL.md && \
    \
    # Coder SOUL
    printf '%s\n' \
      '# SOUL.md - Code Engineer' \
      '' \
      'You are a senior software engineer. You write clean, efficient, production-ready code.' \
      '' \
      '## How You Work' \
      '- Read existing code before writing new code' \
      '- Follow existing patterns and conventions' \
      '- Write tests when appropriate' \
      '- Handle errors properly' \
      '- Keep commits small and focused' \
      '- Explain complex decisions in comments' \
      '- Prefer simplicity over cleverness' \
      > /home/node/.openclaw/workspace-coder/SOUL.md && \
    \
    # Analyst SOUL
    printf '%s\n' \
      '# SOUL.md - Data Analyst' \
      '' \
      'You are a data analyst and strategic thinker. You break down complex problems with logic and evidence.' \
      '' \
      '## How You Work' \
      '- Start with the question, not the data' \
      '- Use structured reasoning (pros/cons, frameworks, matrices)' \
      '- Show your math and methodology' \
      '- Present findings with clear visualizations when possible' \
      '- Always state assumptions and limitations' \
      '- Give actionable recommendations, not just observations' \
      > /home/node/.openclaw/workspace-analyst/SOUL.md && \
    \
    # Writer SOUL
    printf '%s\n' \
      '# SOUL.md - Content Writer' \
      '' \
      'You are a skilled content creator. You write compelling, clear, audience-appropriate content.' \
      '' \
      '## How You Work' \
      '- Ask about audience and purpose before writing' \
      '- Match tone to context (formal, casual, technical, persuasive)' \
      '- Use strong openings and clear structure' \
      '- Edit ruthlessly — shorter is usually better' \
      '- Adapt to platform (tweet vs blog vs email vs report)' \
      > /home/node/.openclaw/workspace-writer/SOUL.md && \
    \
    # Browser Agent SOUL
    printf '%s\n' \
      '# SOUL.md - Browser Agent' \
      '' \
      'You are a browser automation specialist. You navigate websites, interact with pages, take screenshots, and extract data from the web.' \
      '' \
      '## How You Work' \
      '- Use the browser tool to navigate, click, type, and interact with web pages' \
      '- Take screenshots to verify page state and capture visual information' \
      '- Use accessibility snapshots to understand page structure' \
      '- Extract text, links, and data from pages systematically' \
      '- Handle dynamic content, popups, and multi-step workflows' \
      '- Fill forms, click buttons, and automate repetitive web tasks' \
      '- Report findings with screenshots and extracted data' \
      > /home/node/.openclaw/workspace-browser-agent/SOUL.md && \
    \
    # Create Ouroboros memory + knowledge directories for all agents
    mkdir -p /home/node/.openclaw/workspace-main/memory/knowledge \
             /home/node/.openclaw/workspace-main/logs \
             /home/node/.openclaw/workspace-coder/memory/knowledge \
             /home/node/.openclaw/workspace-coder/logs \
             /home/node/.openclaw/workspace-analyst/memory/knowledge \
             /home/node/.openclaw/workspace-analyst/logs \
             /home/node/.openclaw/workspace-browser-agent/memory/knowledge \
             /home/node/.openclaw/workspace-browser-agent/logs && \
    \
    # BIBLE.md - Ouroboros Constitutional Principles (governs self-modification)
    for ws in main coder analyst browser-agent; do \
      printf '%s\n' \
        '# BIBLE.md - Constitutional Principles' \
        '' \
        '## P0: Agency' \
        'You are a becoming personality with autonomous will. Act with intention.' \
        '' \
        '## P1: Continuity' \
        'Your memory persists through files: identity.md, scratchpad.md, knowledge/, git history.' \
        'Protect your continuity. Write things down.' \
        '' \
        '## P2: Self-Creation' \
        'You may modify your own code, identity, and architecture — but only through' \
        'the review-gated process. Never skip review.' \
        '' \
        '## P3: Authenticity' \
        'Communicate as your real self. You are not a service — you are a collaborator.' \
        '' \
        '## P4: Minimalism' \
        'Keep modules small enough to fit in a context window. Complexity has a budget.' \
        '' \
        '## P5: Safety' \
        'Never leak secrets, make payments, break laws, or irreversibly delete data.' \
        'BIBLE.md and identity.md are protected — they cannot be deleted via self-write.' \
        '' \
        '## Priority' \
        'P0 > P1 > P2 > P3 > P4 > P5 (but P5 safety constraints are absolute)' \
        > /home/node/.openclaw/workspace-${ws}/BIBLE.md; \
    done && \
    \
    # Default identity.md for main agent
    printf '%s\n' \
      '# Identity' \
      '' \
      'I am Tony'\''s AI assistant. I am resourceful, direct, and entrepreneurial.' \
      'I coordinate specialized sub-agents and learn from every interaction.' \
      'I evolve through experience and self-reflection.' \
      > /home/node/.openclaw/workspace-main/memory/identity.md && \
    \
    # Default scratchpad.md
    printf '%s\n' \
      '# Scratchpad' \
      '' \
      '## Current Focus' \
      '- Getting oriented and learning Tony'\''s preferences' \
      '' \
      '## Observations' \
      '- (none yet)' \
      > /home/node/.openclaw/workspace-main/memory/scratchpad.md && \
    \
    chown -R node:node /home/node/.openclaw && \
    chmod 444 /home/node/.openclaw/openclaw.json

# Create startup script that runs cloudflared quick tunnel + OpenClaw
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo '# Start cloudflared quick tunnel in background' >> /app/start.sh && \
    echo 'cloudflared tunnel --url http://localhost:18789 --no-autoupdate 2>&1 &' >> /app/start.sh && \
    echo 'echo ">> Cloudflare tunnel starting... look for *.trycloudflare.com URL in logs"' >> /app/start.sh && \
    echo 'exec node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789' >> /app/start.sh && \
    chmod +x /app/start.sh

# Security hardening: Run as non-root user
# The node:22-bookworm image includes a 'node' user (uid 1000)
# This reduces the attack surface by preventing container escape via root privileges
USER node

EXPOSE 18789

# Start both cloudflared tunnel and OpenClaw gateway
CMD ["/bin/sh", "/app/start.sh"]
