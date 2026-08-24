import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "convex/_generated/**",
    // serwist-generated service worker bundles (build artifacts, see .gitignore)
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
    "public/swe-worker-*.js.map",
  ]),
  {
    // Block direct mutation/internalMutation imports from _generated/server.
    // All domain files MUST import from convex/functions.ts to enable audit triggers.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*/_generated/server"],
              importNames: ["mutation", "internalMutation"],
              message:
                "Import mutation/internalMutation from './functions' to enable audit triggers. See notes/11-convex-architecture.md.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
