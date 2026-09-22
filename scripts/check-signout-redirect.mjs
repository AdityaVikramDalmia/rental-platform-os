import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

// Exercise the real production Server Action response, without sending cookies.
// Restrict this probe to a caller-owned local test server/container.
const { values } = parseArgs({
  options: {
    url: { type: "string" },
    "action-id": { type: "string" },
    manifest: { type: "string", default: ".next/server/server-reference-manifest.json" },
  },
});
if (!values.url) throw new Error("Supply --url for a local production server");
const base = new URL(values.url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error("The sign-out regression probe only accepts loopback servers");
}
let actionId = values["action-id"];
if (!actionId) {
  const manifest = JSON.parse(await readFile(values.manifest, "utf8"));
  const matches = Object.entries(manifest.node).filter(([, entry]) => entry.exportedName === "signOutAction");
  if (matches.length !== 1) throw new Error("Expected exactly one built signOutAction");
  actionId = matches[0][0];
}
const response = await fetch(new URL("/homepage", base), {
  method: "POST",
  redirect: "manual",
  headers: {
    "Next-Action": actionId,
    Accept: "text/x-component",
    "Content-Type": "text/plain;charset=UTF-8",
    Origin: base.origin,
  },
  body: "[]",
  signal: AbortSignal.timeout(20_000),
});
const result = {
  status: response.status,
  contentType: response.headers.get("content-type"),
  actionRedirect: response.headers.get("x-action-redirect"),
  location: response.headers.get("location"),
};
await response.body?.cancel();
console.log(JSON.stringify(result));
if (result.status !== 303 || !result.contentType?.startsWith("text/x-component") ||
    result.actionRedirect !== "/homepage;push" || result.location !== null) {
  throw new Error("Sign-out must keep the Server Action redirect response; an HTTP Location can turn it into ordinary HTML");
}
