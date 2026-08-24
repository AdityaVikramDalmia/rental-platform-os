import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
const forbiddenPaths = [".omc/", ".omo/", "session-handoff/", ".local-auth/"];
const tokenPatterns = [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, /sk_(?:live|test)_[A-Za-z0-9]{16,}/, /whsec_[A-Za-z0-9]{16,}/];

for (const prefix of forbiddenPaths) {
  if (tracked.some((path) => path.startsWith(prefix))) throw new Error(`Forbidden tracked path: ${prefix}`);
}
for (const path of tracked.filter((path) => path.endsWith(".md") || path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".mjs"))) {
  const content = readFileSync(join(root, path), "utf8");
  if (tokenPatterns.some((pattern) => pattern.test(content))) throw new Error(`Potential secret in ${path}`);
}
const publicDocumentation = tracked.filter(
  (path) =>
    path === "README.md" ||
    path === "AGENTS.md" ||
    path === "CONTRIBUTING.md" ||
    path === "SECURITY.md" ||
    path.startsWith("notes/") ||
    path.startsWith("tasks/") ||
    path.startsWith("docs/"),
);
for (const path of publicDocumentation) {
  const content = readFileSync(join(root, path), "utf8");
  for (const match of content.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    if (!match[1].startsWith("http") && !existsSync(join(root, path, "..", match[1]))) {
      throw new Error(`Broken local documentation link in ${path}: ${match[1]}`);
    }
  }
}
for (const command of [["npm", "run", "typecheck"], ["npm", "test"], ["npm", "run", "lint"], ["npm", "run", "build"]]) {
  execFileSync(command[0], command.slice(1), { cwd: root, stdio: "inherit" });
}
const clientChunkDirectory = join(root, ".next", "static");
if (!existsSync(clientChunkDirectory)) {
  throw new Error("No .next/static after build — cannot verify client bundles");
}
const demoPasswordPattern = /Dev(?:Admin|Agent|Guard|Ops|Owner|Tenant)123!/;
const clientChunks = readdirSync(clientChunkDirectory, { recursive: true, encoding: "utf8" }).filter(
  (path) => path.endsWith(".js") || path.endsWith(".json"),
);
for (const chunk of clientChunks) {
  const content = readFileSync(join(clientChunkDirectory, chunk), "utf8");
  if (demoPasswordPattern.test(content) || tokenPatterns.some((pattern) => pattern.test(content))) {
    throw new Error(`Credential in publicly-served client chunk: .next/static/${chunk}`);
  }
}
console.log(`release check passed (${clientChunks.length} client chunks scanned)`);
