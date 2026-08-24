#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseFlag(args, flag) {
  return args.includes(flag);
}

function parseOption(args, option) {
  const index = args.indexOf(option);
  if (index === -1 || index === args.length - 1) {
    return null;
  }

  return args[index + 1];
}

function parseJsonFromOutput(output) {
  const trimmedOutput = output.trim();

  if (!trimmedOutput) {
    return null;
  }

  try {
    return JSON.parse(trimmedOutput);
  } catch {
    const lines = trimmedOutput.split("\n").reverse();
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("{") || !line.endsWith("}")) {
        continue;
      }

      try {
        return JSON.parse(line);
      } catch {
        continue;
      }
    }
  }

  return null;
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function assertNumber(value, key) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid migration metric '${key}'`);
  }

  return value;
}

const args = process.argv.slice(2);
const liveMode = parseFlag(args, "--live");
const dryRun = !liveMode;
const cursor = parseOption(args, "--cursor");
const statsJson = parseOption(args, "--stats");

const payload = {
  dry_run: dryRun,
};

if (cursor) {
  payload.cursor = cursor;
}

if (statsJson) {
  payload.stats = JSON.parse(statsJson);
}

const payloadString = JSON.stringify(payload);
const runResult = spawnSync("npx", ["convex", "run", "guards:backfillOpsProfiles", payloadString], {
  encoding: "utf8",
});

if (runResult.status !== 0) {
  if (runResult.stdout) {
    process.stdout.write(runResult.stdout);
  }
  if (runResult.stderr) {
    process.stderr.write(runResult.stderr);
  }
  process.exit(runResult.status ?? 1);
}

const result = parseJsonFromOutput(runResult.stdout);

if (!result) {
  throw new Error("Unable to parse backfill response from convex run output");
}

const scannedCount = assertNumber(result.scanned_count, "scanned_count");
const createdCount = assertNumber(result.created_count, "created_count");
const skippedExistingProfileCount = assertNumber(
  result.skipped_existing_profile_count,
  "skipped_existing_profile_count",
);
const skippedMissingSocietyCount = assertNumber(
  result.skipped_missing_society_count,
  "skipped_missing_society_count",
);
const errorCount = assertNumber(result.error_count, "error_count");

const coverageBase = scannedCount > 0 ? scannedCount : 1;
const createdPct = (createdCount / coverageBase) * 100;
const existingPct = (skippedExistingProfileCount / coverageBase) * 100;
const missingSocietyPct = (skippedMissingSocietyCount / coverageBase) * 100;
const errorPct = (errorCount / coverageBase) * 100;
const projectedCoveragePct = ((createdCount + skippedExistingProfileCount) / coverageBase) * 100;
const coverageGatePassed = projectedCoveragePct >= 95;

console.log("P44-E04 OPS Profile Backfill Report");
console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
console.log(`scanned_count: ${scannedCount}`);
console.log(`created_count: ${createdCount} (${formatPercent(createdPct)})`);
console.log(
  `skipped_existing_profile_count: ${skippedExistingProfileCount} (${formatPercent(existingPct)})`,
);
console.log(
  `skipped_missing_society_count: ${skippedMissingSocietyCount} (${formatPercent(missingSocietyPct)})`,
);
console.log(`error_count: ${errorCount} (${formatPercent(errorPct)})`);
console.log(`projected_profile_coverage: ${formatPercent(projectedCoveragePct)}`);
console.log(`release_gate_rg01_>=95pct: ${coverageGatePassed ? "PASS" : "BREACH"}`);

if (typeof result.next_cursor === "string" && result.next_cursor.length > 0) {
  const resumePayload = JSON.stringify({
    dry_run: dryRun,
    cursor: result.next_cursor,
    stats: {
      scanned_count: scannedCount,
      created_count: createdCount,
      skipped_existing_profile_count: skippedExistingProfileCount,
      skipped_missing_society_count: skippedMissingSocietyCount,
      error_count: errorCount,
    },
  });

  console.log(`next_cursor: ${result.next_cursor}`);
  console.log("resume_command:");
  console.log(`npx convex run guards:backfillOpsProfiles '${resumePayload}'`);
} else {
  console.log("next_cursor: null");
}
