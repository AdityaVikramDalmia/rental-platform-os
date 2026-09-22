import { beforeEach, describe, expect, it, vi } from "vitest";

const workosMocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  listUsers: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    userManagement = workosMocks;
  },
}));

const { ensureDevWorkosUsers } = await import("./workos");

type InternalActionHandler = {
  _handler: (
    ctx: { runMutation: ReturnType<typeof vi.fn> },
    args: Record<string, never>,
  ) => Promise<Record<string, string>>;
};

describe("ensureDevWorkosUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_SEEDING_ENABLED = "true";
    process.env.DEMO_ADMIN_PASSWORD = "test-only-admin-password";
    process.env.DEMO_GUARD_PASSWORD = "test-only-guard-password";
    process.env.DEMO_OPS_PASSWORD = "test-only-ops-password";
    process.env.DEMO_TENANT_PASSWORD = "test-only-tenant-password";
    process.env.DEMO_OWNER_PASSWORD = "test-only-owner-password";
    workosMocks.listUsers.mockImplementation(async ({ email }: { email: string }) => ({
      data: [{ id: `existing:${email}` }],
    }));
  });

  it("keeps existing account passwords unchanged", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const handler = (ensureDevWorkosUsers as unknown as InternalActionHandler)._handler;

    const result = await handler({ runMutation }, {});

    expect(Object.keys(result).length).toBeGreaterThan(0);
    expect(workosMocks.createUser).not.toHaveBeenCalled();
    expect(workosMocks.updateUser).not.toHaveBeenCalled();
  });

  it("uses an explicit persona password when creating a missing account", async () => {
    workosMocks.listUsers.mockImplementation(async ({ email }: { email: string }) => ({
      data: email === "admin@example.com" ? [] : [{ id: `existing:${email}` }],
    }));
    workosMocks.createUser.mockResolvedValue({ id: "created-admin" });
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const handler = (ensureDevWorkosUsers as unknown as InternalActionHandler)._handler;

    await handler({ runMutation }, {});

    expect(workosMocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ password: "test-only-admin-password" }),
    );
    expect(workosMocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses provisioning while the demo deployment gate is disabled", async () => {
    delete process.env.DEMO_SEEDING_ENABLED;
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const handler = (ensureDevWorkosUsers as unknown as InternalActionHandler)._handler;

    await expect(handler({ runMutation }, {})).rejects.toThrow(
      "Demo account provisioning is disabled",
    );

    expect(workosMocks.listUsers).not.toHaveBeenCalled();
    expect(workosMocks.createUser).not.toHaveBeenCalled();
  });

  it("refuses a missing account when its persona password is not configured", async () => {
    delete process.env.DEMO_ADMIN_PASSWORD;
    workosMocks.listUsers.mockImplementation(async ({ email }: { email: string }) => ({
      data: email === "admin@example.com" ? [] : [{ id: `existing:${email}` }],
    }));
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const handler = (ensureDevWorkosUsers as unknown as InternalActionHandler)._handler;

    await expect(handler({ runMutation }, {})).rejects.toThrow("Missing DEMO_ADMIN_PASSWORD");

    expect(workosMocks.createUser).not.toHaveBeenCalled();
  });
});
