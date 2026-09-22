import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

describe("resolvePostAuthDestination portal intent", () => {
  it("allows an OPS-only account into the permission-filtered admin portal", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_ops_backoffice";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "OPS",
        user_types: ["OPS"],
        active_persona: "OPS",
        name: "OPS Backoffice User",
        phone: "7000000099",
        status: "ACTIVE",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const result = await authed.query(api.users.resolvePostAuthDestination, {
      intended_persona: "ADMIN",
    });

    expect(result).toMatchObject({
      pathname: "/admin/dashboard",
      resolved_user_type: "OPS",
      intent_allowed: true,
      persona_to_activate: "OPS",
    });
  });

  it("rejects a tenant account from the admin portal", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_tenant_no_admin";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "TENANT",
        user_types: ["TENANT"],
        active_persona: "TENANT",
        name: "Tenant User",
        email: "tenant-no-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const result = await authed.query(api.users.resolvePostAuthDestination, {
      intended_persona: "ADMIN",
    });

    expect(result).toMatchObject({
      pathname: "/admin/login?error=role_mismatch",
      intent_allowed: false,
    });
  });
});
