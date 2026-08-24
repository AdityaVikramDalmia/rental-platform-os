import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error("Expected a command to run");
}

const environment = { ...process.env };
const localAuthEnabled =
  environment.LOCAL_AUTH === "true" &&
  (environment.NODE_ENV === undefined || environment.NODE_ENV === "development");
const startsConvexDev = command === "npx" && args[0] === "convex" && args[1] === "dev";

if (localAuthEnabled) {
  Object.assign(environment, {
    NODE_ENV: "development",
    NEXT_PUBLIC_LOCAL_AUTH: "true",
    CONVEX_AGENT_MODE: "anonymous",
    CONVEX_DEPLOYMENT: "anonymous:anonymous-agent",
    NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
    NEXT_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211",
    WORKOS_API_HOSTNAME: "127.0.0.1",
    WORKOS_API_HTTPS: "false",
    WORKOS_API_PORT: "3000",
    WORKOS_API_KEY: "local-auth-api-key-not-used",
    WORKOS_CLIENT_ID: "local_auth_client",
    WORKOS_COOKIE_PASSWORD: "local-auth-cookie-password-for-development-only-2026",
    WORKOS_WEBHOOK_SECRET: "local-auth-webhook-secret-not-used",
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://127.0.0.1:3000/callback",
  });
}

const localConvexEnvironment = [
  ["LOCAL_AUTH", "true"],
  ["WORKOS_CLIENT_ID", "local_auth_client"],
  ["WORKOS_API_KEY", "local-auth-api-key-not-used"],
  ["WORKOS_WEBHOOK_SECRET", "local-auth-webhook-secret-not-used"],
];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function setConvexEnvironmentVariable(name, value) {
  return await new Promise((resolve) => {
    const setter = spawn("npx", ["convex", "env", "set", name, value], {
      env: environment,
      stdio: "ignore",
    });
    setter.on("error", () => resolve(false));
    setter.on("exit", (code) => resolve(code === 0));
  });
}

async function provisionLocalConvexEnvironment() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let configured = true;

    for (const [name, value] of localConvexEnvironment) {
      configured = (await setConvexEnvironmentVariable(name, value)) && configured;
    }

    if (configured) {
      return;
    }

    await wait(1000);
  }

  console.error("Local auth could not configure the local Convex environment.");
}

const child = spawn(command, args, {
  env: environment,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (localAuthEnabled && startsConvexDev) {
  void provisionLocalConvexEnvironment();
}

child.on("error", (error) => {
  throw error;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
