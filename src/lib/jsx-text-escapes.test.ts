// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// JSX text does not process JS escapes: <span>—</span> renders the six characters "—".
// An escape is only decoded inside a JS string, e.g. <span>{"—"}</span>.
const JSX_TEXT_ESCAPE = />[^<>{}"'`]*\\u[0-9a-fA-F]{4}[^<>{}"'`]*</;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("JSX text", () => {
  it("contains no literal \\uXXXX escapes", () => {
    const root = join(__dirname, "..");
    const offenders = tsxFiles(root).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          JSX_TEXT_ESCAPE.test(line) ? [`${relative(root, file)}:${index + 1}`] : [],
        ),
    );
    expect(offenders).toEqual([]);
  });
});
