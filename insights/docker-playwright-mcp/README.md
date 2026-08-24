# Docker Playwright MCP — Binding + Transport Debugging

## Symptom

Docker containers running `mcr.microsoft.com/playwright/mcp` start successfully, logs show `Listening on http://localhost:8931`, but:

- OpenCode remote MCP connections fail silently (never reaches "connected" or "successfully created client" in logs)
- `curl POST /mcp` returns "Empty reply from server" (IPv6) or "Connection reset by peer" (IPv4)
- Enabling `browser-pool-N` in `opencode.json` causes the user to repeatedly click "connect" with no effect
- Other MCPs (context7, websearch, grep_app) unaffected — they connect fine

## Root Cause

The Playwright MCP server inside Docker binds to `::1` (IPv6 loopback) by default. Docker port mapping (`-p 8931:8931`) forwards host traffic to the container, but the container's server only accepts connections on the loopback interface — rejecting forwarded traffic from Docker's bridge network.

Verified via `/proc/net/tcp6` inside the container:

```
BEFORE (broken): 00000000000000000000000001000000:22E3 → [::1]:8931 (loopback only)
AFTER (fixed):   00000000:22E3 → 0.0.0.0:8931 (all interfaces)
```

## Fix

Add `--host 0.0.0.0` to the container's entrypoint args:

```bash
docker run -d -i --rm --init \
  --entrypoint node \
  --name pw-pool-1 \
  -p 8931:8931 \
  --add-host=host.docker.internal:host-gateway \
  mcr.microsoft.com/playwright/mcp \
  cli.js --headless --browser chromium --no-sandbox --port 8931 --host 0.0.0.0
```

## Verification

```bash
curl -v --max-time 5 -X POST "http://localhost:8931/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Expected: HTTP 200, `mcp-session-id` header, JSON-RPC response with `Playwright` serverInfo.

## Debugging Checklist

1. Check container is running: `docker ps --filter "name=pw-pool"`
2. Check binding inside container: `docker exec pw-pool-1 cat /proc/net/tcp` — should show `00000000:PORT` not `0100007F:PORT` or IPv6 loopback
3. Test from host: `curl -v POST http://localhost:PORT/mcp` with proper MCP initialize payload
4. Check OpenCode logs: `~/.local/share/opencode/log/` — look for `transport=StreamableHTTP connected` after the `key=browser-pool-N type=remote found` line
5. If "found" but never "connected" → binding issue, add `--host 0.0.0.0`

## Transport Details

- Playwright MCP Docker uses **Streamable HTTP** transport (POST to `/mcp`, response as SSE with `mcp-session-id`)
- Legacy SSE endpoint at `/sse` also exists but OpenCode uses Streamable HTTP
- OpenCode config: `"type": "remote", "url": "http://localhost:PORT/mcp"` — this is correct
- The `/mcp` endpoint returns `content-type: text/event-stream` on successful handshake

---

## Issue 2: Convex WebSocket Unreachable from Docker Browsers

### Symptom

Docker Playwright browsers navigate to `http://host.docker.internal:3000` successfully — the Next.js page HTML/JS loads fine. But the app is stuck on loading spinners forever. Console shows:

```
WebSocket connection to ws://127.0.0.1:3210/api/1.31.7/sync failed (ERR_CONNECTION_REFUSED)
```

All Convex-powered pages (admin dashboard, guard portal, any page using `useQuery`) are non-functional — they render skeletons/spinners but never load data.

### Root Cause

`NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210` is set in `.env.local`. This URL is **baked into the client-side JavaScript bundle** at build time (it's a `NEXT_PUBLIC_` variable). When the Docker browser loads a Next.js page:

1. Browser fetches HTML/JS from `host.docker.internal:3000` (works — this is the host's Next.js server)
2. Client-side Convex SDK initializes: `new ConvexReactClient("http://127.0.0.1:3210")`
3. SDK opens WebSocket to `ws://127.0.0.1:3210/api/sync`
4. **From inside Docker, `127.0.0.1` is the container's own loopback** — nothing is listening on port 3210 inside the container
5. Connection refused → Convex queries never resolve → UI stuck on loading state

**Key insight**: The Convex backend at port 3210 IS reachable from Docker via `host.docker.internal:3210` (verified: WebSocket handshake succeeds). The problem is purely that the URL baked into the JS bundle says `127.0.0.1` instead of `host.docker.internal`.

### Fix: Monkey-Patch WebSocket + Fetch via addInitScript

Use Playwright's `page.addInitScript()` to intercept and rewrite Convex connection URLs **before any page JavaScript runs**. This must be done ONCE per browser context — it persists across all subsequent navigations.

```javascript
// Run this via browser_run_code BEFORE navigating to any app page
await page.addInitScript(() => {
  // Patch WebSocket constructor to rewrite Convex URLs
  const OrigWebSocket = window.WebSocket;
  const PatchedWebSocket = function (url, protocols) {
    if (typeof url === "string") {
      url = url
        .replace("ws://127.0.0.1:3210", "ws://host.docker.internal:3210")
        .replace("wss://127.0.0.1:3210", "wss://host.docker.internal:3210")
        .replace("http://127.0.0.1:3210", "http://host.docker.internal:3210");
    }
    return protocols !== undefined ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url);
  };
  PatchedWebSocket.prototype = OrigWebSocket.prototype;
  PatchedWebSocket.CONNECTING = OrigWebSocket.CONNECTING;
  PatchedWebSocket.OPEN = OrigWebSocket.OPEN;
  PatchedWebSocket.CLOSING = OrigWebSocket.CLOSING;
  PatchedWebSocket.CLOSED = OrigWebSocket.CLOSED;
  window.WebSocket = PatchedWebSocket;

  // Patch fetch for Convex HTTP API calls (file storage URLs, etc.)
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === "string") {
      input = input.replace("http://127.0.0.1:3210", "http://host.docker.internal:3210");
    } else if (input instanceof Request && input.url.includes("127.0.0.1:3210")) {
      input = new Request(
        input.url.replace("http://127.0.0.1:3210", "http://host.docker.internal:3210"),
        input,
      );
    }
    return origFetch.call(this, input, init);
  };
});
```

### How to Apply in Practice

**Orchestrator (before spawning agents):**

```javascript
// Install the patch on each Docker browser pool
mcp_browser-pool-1_browser_run_code({ code: `async (page) => {
  await page.addInitScript(() => { /* full patch above */ });
  await page.goto('http://host.docker.internal:3000/dev/login', { waitUntil: 'networkidle' });
  return 'Patch installed + page loaded';
}` });
```

**Sub-agent (if orchestrator didn't pre-install):**

The sub-agent's FIRST action must be `browser_run_code` with the `addInitScript` patch BEFORE any `browser_navigate`. The init script only needs to be installed once — it persists for all subsequent navigations in that browser context.

### Verification

After installing the patch, navigate to any Convex-powered page (e.g., `/admin/dashboard`). The page should:

- Render full content (not loading spinners)
- Console should NOT show `ERR_CONNECTION_REFUSED` for port 3210
- Console SHOULD show WebSocket connections to `host.docker.internal:3210` succeeding

### Why Not Just Change NEXT_PUBLIC_CONVEX_URL?

`host.docker.internal` does NOT resolve on the macOS host machine (only inside Docker containers). Changing the env var would break local browser development. The monkey-patch is Docker-browser-only and doesn't touch any project files.

### Timeline

- Discovered: 2026-02-17
- Time to diagnose: ~15 minutes (after recognizing the ERR_CONNECTION_REFUSED pattern)
- Affects: ALL Docker browser testing of Convex-powered apps with local dev backend

---

## Summary Timeline

- Image: `mcr.microsoft.com/playwright/mcp:latest` (Playwright MCP v0.0.68)
- Issue 1 (MCP binding) discovered: 2026-02-17, ~45 minutes to diagnose
- Issue 2 (Convex WebSocket) discovered: 2026-02-17, ~15 minutes to diagnose
- Official docs do NOT mention either issue — they only affect Docker + local dev setups
