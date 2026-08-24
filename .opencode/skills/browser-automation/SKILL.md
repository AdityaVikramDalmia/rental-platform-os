---
name: browser-automation
description: Docker-based parallel browser pool for verification agents — isolated Chromium containers with Playwright MCP, tool invocation patterns, URL rewriting, claim protocol, and fallback to shared browser. Replaces the playwright skill for Docker pool usage.
license: MIT
---

# Browser Automation — Docker Parallel Pool

Run isolated Chromium browsers via Docker containers. Each container = one Playwright MCP server on a dedicated port. Enables parallel browser testing without conflicts.

**This skill replaces the `playwright` skill when Docker pool MCPs are available.** Do NOT load both — this skill contains all Playwright tool patterns you need.

## Which MCP To Use

| Situation                                                          | MCP Name                                                | How to Call Tools                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Docker pool available (orchestrator assigned you `browser-pool-N`) | `browser-pool-1`, `browser-pool-2`, or `browser-pool-3` | `skill_mcp(mcp_name="browser-pool-1", tool_name="browser_navigate", arguments={...})` |
| Docker pool NOT available (fallback)                               | `playwright`                                            | `skill_mcp(mcp_name="playwright", tool_name="browser_navigate", arguments={...})`     |

**Your orchestrator prompt will tell you which pool number to use.** If it says "Use browser-pool-2", then ALL your browser tool calls use `mcp_name="browser-pool-2"`.

## URL Rewriting (CRITICAL)

Docker browsers cannot reach `localhost` on the host machine. You MUST rewrite URLs:

| Context                        | URL                                    |
| ------------------------------ | -------------------------------------- |
| Docker pool browser            | `http://host.docker.internal:3000/...` |
| Standard playwright (fallback) | `http://localhost:3000/...`            |

```
skill_mcp(mcp_name="browser-pool-1", tool_name="browser_navigate",
  arguments={"url": "http://host.docker.internal:3000/dev/login"})     ✓

skill_mcp(mcp_name="browser-pool-1", tool_name="browser_navigate",
  arguments={"url": "http://localhost:3000/dev/login"})                ✗ WILL FAIL
```

**Every single URL you pass to a Docker browser must use `host.docker.internal` instead of `localhost`.**

## Tool Reference

All tools are called via `skill_mcp`. Replace `{MCP}` with your assigned MCP name (e.g., `browser-pool-1`).

### Navigation

```
skill_mcp(mcp_name="{MCP}", tool_name="browser_navigate", arguments={"url": "http://host.docker.internal:3000/admin/guards"})
```

### Snapshot (MUST do before any interaction)

```
skill_mcp(mcp_name="{MCP}", tool_name="browser_snapshot", arguments={})
```

Returns the accessibility tree with `ref` values. You NEED these refs to click/fill.

### Click

```
skill_mcp(mcp_name="{MCP}", tool_name="browser_click", arguments={"element": "Submit", "ref": "e45"})
```

### Type

```
skill_mcp(mcp_name="{MCP}", tool_name="browser_type", arguments={"element": "Phone", "ref": "e12", "text": "9876543210"})
```

### Wait For

```
skill_mcp(mcp_name="{MCP}", tool_name="browser_wait_for", arguments={"text": "Guard created successfully"})
```

### Tabs

```
skill_mcp(mcp_name="{MCP}", tool_name="browser_tab_list", arguments={})
skill_mcp(mcp_name="{MCP}", tool_name="browser_tab_new", arguments={})
skill_mcp(mcp_name="{MCP}", tool_name="browser_tab_select", arguments={"index": 2})
skill_mcp(mcp_name="{MCP}", tool_name="browser_tab_close", arguments={})
```

### Console & Network

```
skill_mcp(mcp_name="{MCP}", tool_name="browser_console_messages", arguments={})
skill_mcp(mcp_name="{MCP}", tool_name="browser_network_requests", arguments={})
```

### Evaluate JavaScript

```
skill_mcp(mcp_name="{MCP}", tool_name="browser_evaluate", arguments={"expression": "window.location.href"})
```

## Workflow Patterns

### Core: ALWAYS Snapshot Before Acting

```
1. browser_navigate → target URL
2. browser_wait_for → key text visible
3. browser_snapshot → get accessibility tree (gives ref values)
4. THEN click/type using refs from snapshot
```

**Never interact without a fresh snapshot.** Refs change between navigations.

### Login (Auth-Gated Pages)

```
1. browser_navigate → http://host.docker.internal:3000/dev/login
2. browser_snapshot → find login form/buttons
3. browser_click → "Test Admin" or "Test Guard" preset button
4. browser_wait_for → "Dashboard" or redirect text
5. browser_snapshot → confirm logged in
6. THEN navigate to the page you're testing
```

Test accounts:

| Persona | Email                       | Password       | Preset Button |
| ------- | --------------------------- | -------------- | ------------- |
| Admin   | `admin@example.com`        | `DevAdmin123!` | "Test Admin"  |
| Guard   | `9999999999@guards.local` | `DevGuard123!` | "Test Guard"  |

### Form Testing

```
1. browser_snapshot → get form field refs
2. browser_type → fill each field using refs
3. browser_click → submit button ref
4. browser_wait_for → success toast or redirect
5. browser_snapshot → verify post-submit state
```

### Validation Error Testing

```
1. browser_type → fill with INVALID data (empty, too short, wrong format)
2. browser_click → submit
3. browser_snapshot → look for error messages in accessibility tree
4. Assert: error text matches expected
```

### Toast Verification

```
1. Perform action that triggers toast
2. browser_wait_for → toast text (sonner toasts appear briefly)
3. browser_snapshot → find toast in tree
```

### Tab Isolation (One Tab Per Scenario)

```
1. browser_tab_new → fresh tab
2. Run your scenario
3. browser_tab_close → clean up
```

Prevents cookie/state leakage between test scenarios.

### Error Capture (On ANY Unexpected Behavior)

```
1. browser_console_messages → JS errors
2. browser_network_requests → failed API calls (4xx/5xx)
3. browser_snapshot → current state
```

## Claim Protocol

Prevents two agents from using the same Docker browser.

### Before Using Your Pool

```
1. skill_mcp(mcp_name="{MCP}", tool_name="browser_tab_list") → check tabs
2. If tab 0 title contains "CLAIMED:" and NOT your session → STOP, wrong pool
3. skill_mcp(mcp_name="{MCP}", tool_name="browser_navigate",
     arguments={"url": "data:text/html,<title>CLAIMED:{your_session}</title>"})
4. skill_mcp(mcp_name="{MCP}", tool_name="browser_tab_new") → work in new tabs
```

### When Done

```
1. Close all work tabs
2. Select tab 0
3. browser_navigate → data:text/html,<title>FREE</title>
```

## Pool Management (For Orchestrators)

Start/stop containers via the pool script:

```bash
.opencode/skills/browser-automation/scripts/pool.sh start    # 3 containers
.opencode/skills/browser-automation/scripts/pool.sh stop
.opencode/skills/browser-automation/scripts/pool.sh status
.opencode/skills/browser-automation/scripts/pool.sh restart
```

| Container | Port | MCP Endpoint              | OpenCode MCP Name |
| --------- | ---- | ------------------------- | ----------------- |
| pw-pool-1 | 8931 | http://localhost:8931/mcp | browser-pool-1    |
| pw-pool-2 | 8932 | http://localhost:8932/mcp | browser-pool-2    |
| pw-pool-3 | 8933 | http://localhost:8933/mcp | browser-pool-3    |

### Spawning Sub-Agents (Orchestrator Pattern)

```typescript
task(
  (category = "deep"),
  (load_skills = ["browser-automation", "verification-agent", "rental-platform-os-rules"]),
  (prompt =
    "... You are assigned browser-pool-1. Use mcp_name='browser-pool-1' for ALL browser tool calls via skill_mcp. All URLs must use host.docker.internal:3000 instead of localhost:3000. ..."),
);

task(
  (category = "deep"),
  (load_skills = ["browser-automation", "verification-agent", "rental-platform-os-rules"]),
  (prompt =
    "... You are assigned browser-pool-2. Use mcp_name='browser-pool-2' for ALL browser tool calls via skill_mcp. All URLs must use host.docker.internal:3000 instead of localhost:3000. ..."),
);
```

**Do NOT load `playwright` skill when using Docker pool.** This skill replaces it. Loading both will confuse the agent about which MCP to use.

## Fallback (No Docker Pool)

If Docker containers aren't running or MCPs aren't enabled:

1. Load `playwright` skill instead of `browser-automation`
2. Use `mcp_name="playwright"` for tool calls
3. Use `localhost:3000` URLs (no rewriting needed)
4. Only ONE agent can use the browser at a time (sequential)

## Troubleshooting

If containers start but MCP connections fail, see `insights/docker-playwright-mcp/README.md`.

TL;DR: add `--host 0.0.0.0` to Docker run command — the server defaults to loopback binding, which rejects port-mapped traffic.

OpenCode MCP logs: `~/.local/share/opencode/log/` — look for `transport=StreamableHTTP connected` after `key=browser-pool-N type=remote found`. If "found" but never "connected" → binding issue.

## Convex WebSocket Patch (MANDATORY for Convex Apps)

**Problem**: The Convex SDK's client-side JS connects to `ws://127.0.0.1:3210` (from `NEXT_PUBLIC_CONVEX_URL` baked into the bundle). Inside Docker, `127.0.0.1` is the container's own loopback — nothing listens there. Result: ALL Convex-powered pages show loading spinners forever.

**Fix**: Monkey-patch `WebSocket` and `fetch` constructors via `addInitScript` to rewrite `127.0.0.1:3210` → `host.docker.internal:3210`. Must run ONCE per browser context BEFORE any page navigation.

**Full details**: See `insights/docker-playwright-mcp/README.md` → Issue 2.

### The Patch Code (Copy-Paste Ready)

Run this via `browser_run_code` as the FIRST action on each Docker browser pool:

```javascript
async (page) => {
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
      if (protocols !== undefined) {
        return new OrigWebSocket(url, protocols);
      }
      return new OrigWebSocket(url);
    };
    PatchedWebSocket.prototype = OrigWebSocket.prototype;
    PatchedWebSocket.CONNECTING = OrigWebSocket.CONNECTING;
    PatchedWebSocket.OPEN = OrigWebSocket.OPEN;
    PatchedWebSocket.CLOSING = OrigWebSocket.CLOSING;
    PatchedWebSocket.CLOSED = OrigWebSocket.CLOSED;
    window.WebSocket = PatchedWebSocket;

    // Patch fetch for Convex HTTP API calls (file storage, etc.)
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
  await page.goto("http://host.docker.internal:3000/dev/login", {
    waitUntil: "networkidle",
    timeout: 15000,
  });
  return "Convex WebSocket patch installed + login page loaded";
};
```

### When to Apply

- **Orchestrator pre-installing**: Run the patch on each browser pool BEFORE spawning sub-agents. The sub-agents then get a working browser out of the box.
- **Sub-agent self-installing**: If the orchestrator didn't pre-install, the sub-agent's FIRST action must be `browser_run_code` with this patch BEFORE any `browser_navigate`.
- **Persistence**: The `addInitScript` persists for the lifetime of the browser context — all subsequent navigations are patched automatically.

### How to Verify the Patch Works

After installing, navigate to any Convex-powered page (e.g., `/admin/dashboard`):

- Page renders full content (not loading spinners)
- Browser console does NOT show `ERR_CONNECTION_REFUSED` for port 3210
- WebSocket connections to `host.docker.internal:3210` succeed

### Orchestrator Spawning Pattern (Updated)

When spawning sub-agents for Docker browser verification, EITHER:

1. **Pre-install the patch** on each pool before spawning agents (recommended), OR
2. **Include patch instructions** in the sub-agent prompt with this exact code block

```typescript
// Option 1: Orchestrator pre-installs (recommended)
mcp_browser-pool-1_browser_run_code({ code: `/* patch code above */` });
mcp_browser-pool-2_browser_run_code({ code: `/* patch code above */` });
mcp_browser-pool-3_browser_run_code({ code: `/* patch code above */` });
// THEN spawn sub-agents — they get working browsers

// Option 2: Sub-agent self-installs (include in prompt)
task(category="deep", load_skills=["browser-automation", ...], prompt=`
  ... BEFORE any browser_navigate, run browser_run_code with the Convex WebSocket
  patch from the "Convex WebSocket Patch" section of the browser-automation skill.
  This is MANDATORY — without it, all Convex pages will show loading spinners.
  ...
`);
```

## Hard Rules

- ALWAYS use `host.docker.internal` instead of `localhost` in Docker browser URLs
- ALWAYS install the Convex WebSocket patch BEFORE navigating to any Convex-powered page
- ALWAYS snapshot before any click/type interaction
- ALWAYS claim your pool before using it, release when done
- NEVER load both `browser-automation` and `playwright` skills on the same agent
- NEVER use a pool number not assigned to you by the orchestrator
- If Docker pool unavailable → fall back to `playwright` skill, sequential only
