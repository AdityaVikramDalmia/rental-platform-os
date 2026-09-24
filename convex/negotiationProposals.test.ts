import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_TYPE,
  LEAD_STATUS,
  NEGOTIATION_PROPOSAL_STATUS,
  NEGOTIATION_ROOM_TYPE,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TENANT_INQUIRY_STATUS,
  USER_STATUS,
  USER_TYPE,
} from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_negotiation_proposals";
process.env.WORKOS_API_KEY ??= "sk_test_negotiation_proposals";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_negotiation_proposals";
process.env.CONVEX_DISABLE_SCHEDULER_SIDE_EFFECTS ??= "1";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const ADMIN_WORKOS_ID = "user_negotiation_admin";
const TENANT_WORKOS_ID = "user_negotiation_tenant";
const OWNER_WORKOS_ID = "user_negotiation_owner";
const ALL_ROOMS = [
  NEGOTIATION_ROOM_TYPE.OPS_TENANT,
  NEGOTIATION_ROOM_TYPE.OPS_OWNER,
  NEGOTIATION_ROOM_TYPE.COMBINED,
];

function createTestBackend() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTestBackend>;

async function createNegotiationFixture(t: TestBackend) {
  const ids = await t.run(async (ctx) => {
    const insertUser = (workosUserId: string, userType: "ADMIN" | "TENANT" | "OWNER" | "GUARD") =>
      ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: userType,
        name: `Test ${userType}`,
        email: `${workosUserId}@example.com`,
        status: USER_STATUS.ACTIVE,
        must_change_password: false,
      });

    const adminId = await insertUser(ADMIN_WORKOS_ID, USER_TYPE.ADMIN);
    const tenantId = await insertUser(TENANT_WORKOS_ID, USER_TYPE.TENANT);
    const ownerId = await insertUser(OWNER_WORKOS_ID, USER_TYPE.OWNER);
    const guardId = await insertUser("user_negotiation_guard", USER_TYPE.GUARD);

    const roleId = await ctx.db.insert("roles", {
      name: "Negotiation manager",
      permissions: [PERMISSIONS.NEGOTIATIONS_VIEW, PERMISSIONS.NEGOTIATIONS_MANAGE],
      is_system_role: false,
      is_deleted: false,
    });
    await ctx.db.insert("user_role_assignments", {
      user_id: adminId,
      role_id: roleId,
      assigned_by_admin_id: adminId,
      is_deleted: false,
    });

    const societyId = await ctx.db.insert("societies", {
      name: "Synthetic Society",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: adminId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower A",
      total_floors: 10,
      floor_labels: ["G", "1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "2",
      flat_number: "201",
      owner_phone: "9876543210",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: guardId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      slug: "synthetic-2bhk",
      status: "PUBLISHED",
      rent_monthly: 3_000_000,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "2",
      available_from: Date.now(),
      created_by_admin_id: adminId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenantId,
      tenant_name: "Synthetic Tenant",
      tenant_phone: "9123456780",
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    });

    const now = Date.now();
    const negotiationId = await ctx.db.insert("negotiations", {
      tenant_inquiry_id: inquiryId,
      listing_id: listingId,
      tenant_user_id: tenantId,
      owner_user_id: ownerId,
      initiated_by_admin_id: adminId,
      status: NEGOTIATION_STATUS.ACTIVE,
      initiated_at: now,
      last_activity_at: now,
      stale_flagged: false,
      rounds_flagged: false,
      is_deleted: false,
    });

    const insertChannel = (channelType: "OPS_TENANT" | "OPS_OWNER" | "COMBINED") =>
      ctx.db.insert("chat_channels", {
        inquiry_id: inquiryId,
        channel_type: channelType,
        negotiation_id: negotiationId,
        status: "ACTIVE",
        created_by_admin_id: adminId,
        created_at: now,
      });

    await ctx.db.patch(negotiationId, {
      ops_tenant_channel_id: await insertChannel(NEGOTIATION_ROOM_TYPE.OPS_TENANT),
      ops_owner_channel_id: await insertChannel(NEGOTIATION_ROOM_TYPE.OPS_OWNER),
      combined_channel_id: await insertChannel(NEGOTIATION_ROOM_TYPE.COMBINED),
    });

    return { negotiationId };
  });

  return {
    ...ids,
    admin: t.withIdentity({ subject: ADMIN_WORKOS_ID, issuer: WORKOS_ISSUER }),
    tenant: t.withIdentity({ subject: TENANT_WORKOS_ID, issuer: WORKOS_ISSUER }),
    owner: t.withIdentity({ subject: OWNER_WORKOS_ID, issuer: WORKOS_ISSUER }),
  };
}

type Fixture = Awaited<ReturnType<typeof createNegotiationFixture>>;

async function createAndShareProposal(
  fixture: Fixture,
  monthlyRentPaise: number,
): Promise<Id<"negotiation_terms_proposals">> {
  const proposalId = await fixture.admin.mutation(api.negotiationProposals.create, {
    negotiation_id: fixture.negotiationId,
    monthly_rent_paise: monthlyRentPaise,
    security_deposit_paise: monthlyRentPaise * 2,
    security_deposit_months: 2,
    lock_in_period_months: 11,
    notice_period_months: 1,
    move_in_date: Date.now() + 30 * 24 * 60 * 60 * 1000,
    maintenance_charges_paise: 250_000,
    maintenance_paid_by: "TENANT",
    rent_escalation_type: "PERCENTAGE",
    rent_escalation_value: 5,
    furnishing_terms: "Semi-furnished as inspected",
    brokerage_tenant_side_paise: 1_500_000,
    brokerage_owner_side_paise: 1_500_000,
    token_advance_amount_paise: 1_000_000,
  });

  await fixture.admin.mutation(api.negotiationProposals.share, {
    proposal_id: proposalId,
    room_types: ALL_ROOMS,
  });

  return proposalId;
}

function sign(
  signer: Fixture["tenant"] | Fixture["owner"],
  proposalId: Id<"negotiation_terms_proposals">,
) {
  return signer.mutation(api.negotiationProposals.signTerms, {
    proposal_id: proposalId,
    agreement_text: "I agree to these terms.",
  });
}

async function readState(
  t: TestBackend,
  negotiationId: Id<"negotiations">,
  proposalId: Id<"negotiation_terms_proposals">,
) {
  return await t.run(async (ctx) => {
    const negotiation = await ctx.db.get(negotiationId);
    const proposal = await ctx.db.get(proposalId);
    const signatures = await ctx.db
      .query("negotiation_terms_signatures")
      .withIndex("by_proposal_id", (q) => q.eq("proposal_id", proposalId))
      .collect();
    return { negotiation, proposal, signatures };
  });
}

async function expectTermsAgreed(
  t: TestBackend,
  negotiationId: Id<"negotiations">,
  proposalId: Id<"negotiation_terms_proposals">,
) {
  const { negotiation, proposal, signatures } = await readState(t, negotiationId, proposalId);
  expect(negotiation?.status).toBe(NEGOTIATION_STATUS.TERMS_AGREED);
  expect(negotiation?.terms_agreed_at).toBeTypeOf("number");
  expect(proposal?.status).toBe(NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED);
  expect(proposal?.is_locked).toBe(true);
  expect(signatures.map((signature) => signature.user_role).sort()).toEqual(["OWNER", "TENANT"]);
}

describe("negotiationProposals.signTerms bilateral completion", () => {
  it("agrees the initial shared proposal (TERMS_PROPOSED → TERMS_AGREED)", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);

    const proposalId = await createAndShareProposal(fixture, 3_000_000);
    const shared = await readState(t, fixture.negotiationId, proposalId);
    expect(shared.negotiation?.status).toBe(NEGOTIATION_STATUS.TERMS_PROPOSED);

    await sign(fixture.tenant, proposalId);
    await sign(fixture.owner, proposalId);

    await expectTermsAgreed(t, fixture.negotiationId, proposalId);
  });

  it("agrees a shared counter-proposal when the tenant signs first and the owner second", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);

    await createAndShareProposal(fixture, 3_000_000);
    const counterId = await createAndShareProposal(fixture, 2_900_000);
    const shared = await readState(t, fixture.negotiationId, counterId);
    expect(shared.negotiation?.status).toBe(NEGOTIATION_STATUS.COUNTER_PROPOSED);

    await sign(fixture.tenant, counterId);
    await sign(fixture.owner, counterId);

    await expectTermsAgreed(t, fixture.negotiationId, counterId);
  });

  it("agrees a shared counter-proposal when the owner signs first and the tenant second", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);

    await createAndShareProposal(fixture, 3_000_000);
    const counterId = await createAndShareProposal(fixture, 2_900_000);

    await sign(fixture.owner, counterId);
    await sign(fixture.tenant, counterId);

    await expectTermsAgreed(t, fixture.negotiationId, counterId);
  });

  it("agrees a later revision shared while the negotiation is already COUNTER_PROPOSED", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);

    await createAndShareProposal(fixture, 3_000_000);
    await createAndShareProposal(fixture, 2_900_000);
    const thirdId = await createAndShareProposal(fixture, 2_850_000);
    const shared = await readState(t, fixture.negotiationId, thirdId);
    expect(shared.negotiation?.status).toBe(NEGOTIATION_STATUS.COUNTER_PROPOSED);
    expect(shared.proposal?.version).toBe(3);

    await sign(fixture.tenant, thirdId);
    await sign(fixture.owner, thirdId);

    await expectTermsAgreed(t, fixture.negotiationId, thirdId);
  });

  it("does not count a signature on a superseded version toward the current counter-proposal", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);

    const firstId = await createAndShareProposal(fixture, 3_000_000);
    await sign(fixture.tenant, firstId);

    const counterId = await createAndShareProposal(fixture, 2_900_000);
    await expect(sign(fixture.tenant, firstId)).rejects.toThrow(
      "Proposal is no longer active — it has been superseded.",
    );

    await sign(fixture.owner, counterId);
    const oneSided = await readState(t, fixture.negotiationId, counterId);
    expect(oneSided.negotiation?.status).toBe(NEGOTIATION_STATUS.COUNTER_PROPOSED);
    expect(oneSided.negotiation?.terms_agreed_at).toBeUndefined();
    expect(oneSided.proposal?.status).toBe(NEGOTIATION_PROPOSAL_STATUS.SHARED);
    expect(oneSided.proposal?.is_locked).toBe(false);
    expect(oneSided.signatures.map((signature) => signature.user_role)).toEqual(["OWNER"]);

    await sign(fixture.tenant, counterId);

    await expectTermsAgreed(t, fixture.negotiationId, counterId);
    const stale = await readState(t, fixture.negotiationId, firstId);
    expect(stale.proposal?.status).toBe(NEGOTIATION_PROPOSAL_STATUS.SHARED);
    expect(stale.proposal?.is_locked).toBe(false);
    expect(stale.signatures.map((signature) => signature.user_role)).toEqual(["TENANT"]);
  });
});

describe("negotiationProposals.signTerms while STALLED", () => {
  it("rejects a signature up front instead of recording one that cannot complete", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);

    const proposalId = await createAndShareProposal(fixture, 3_000_000);
    await fixture.admin.mutation(api.negotiations.markStalled, {
      negotiation_id: fixture.negotiationId,
      failure_reason: "Parties unresponsive",
    });

    await expect(sign(fixture.tenant, proposalId)).rejects.toThrow(
      "Cannot sign terms while negotiation is STALLED",
    );
    await expect(sign(fixture.owner, proposalId)).rejects.toThrow(
      "Cannot sign terms while negotiation is STALLED",
    );

    const state = await readState(t, fixture.negotiationId, proposalId);
    expect(state.negotiation?.status).toBe(NEGOTIATION_STATUS.STALLED);
    expect(state.proposal?.status).toBe(NEGOTIATION_PROPOSAL_STATUS.SHARED);
    expect(state.signatures).toEqual([]);
  });

  it("resumes through a shared revision that both parties can then agree", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);

    await createAndShareProposal(fixture, 3_000_000);
    await fixture.admin.mutation(api.negotiations.markStalled, {
      negotiation_id: fixture.negotiationId,
      failure_reason: "Parties unresponsive",
    });

    const revisionId = await createAndShareProposal(fixture, 2_900_000);
    const resumed = await readState(t, fixture.negotiationId, revisionId);
    expect(resumed.negotiation?.status).toBe(NEGOTIATION_STATUS.COUNTER_PROPOSED);

    await sign(fixture.owner, revisionId);
    await sign(fixture.tenant, revisionId);

    await expectTermsAgreed(t, fixture.negotiationId, revisionId);
  });
});

describe("negotiationProposals.signTerms signer resolution", () => {
  async function insertMultiPersonaUser(
    t: TestBackend,
    workosUserId: string,
    primary: "TENANT" | "OWNER",
    secondary: "TENANT" | "OWNER",
  ) {
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: primary,
        user_types: [primary, secondary],
        active_persona: secondary,
        name: `Multi-persona ${workosUserId}`,
        email: `${workosUserId}@example.com`,
        status: USER_STATUS.ACTIVE,
        must_change_password: false,
      }),
    );
    return { userId, as: t.withIdentity({ subject: workosUserId, issuer: WORKOS_ISSUER }) };
  }

  it.fails(
    "lets an owner linked through a secondary OWNER persona sign and complete TERMS_AGREED (BUG-050)",
    async () => {
      const t = createTestBackend();
      const fixture = await createNegotiationFixture(t);
      const secondaryOwner = await insertMultiPersonaUser(
        t,
        "user_negotiation_secondary_owner",
        USER_TYPE.TENANT,
        USER_TYPE.OWNER,
      );
      await t.run(async (ctx) => {
        await ctx.db.patch(fixture.negotiationId, { owner_user_id: undefined });
      });
      await fixture.admin.mutation(api.negotiations.linkOwnerToNegotiation, {
        negotiation_id: fixture.negotiationId,
        owner_user_id: secondaryOwner.userId,
      });

      const proposalId = await createAndShareProposal(fixture, 3_000_000);
      await sign(fixture.tenant, proposalId);
      await secondaryOwner.as.mutation(api.negotiationProposals.signTerms, {
        proposal_id: proposalId,
        agreement_text: "I agree to these terms.",
      });

      await expectTermsAgreed(t, fixture.negotiationId, proposalId);
    },
  );

  it.fails(
    "lets the inquiry tenant sign when their primary persona is OWNER and TENANT is secondary (BUG-050)",
    async () => {
      const t = createTestBackend();
      const fixture = await createNegotiationFixture(t);
      await t.run(async (ctx) => {
        const tenant = await ctx.db
          .query("users")
          .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", TENANT_WORKOS_ID))
          .unique();
        await ctx.db.patch(tenant!._id, {
          user_type: USER_TYPE.OWNER,
          user_types: [USER_TYPE.OWNER, USER_TYPE.TENANT],
          active_persona: USER_TYPE.TENANT,
        });
      });

      const proposalId = await createAndShareProposal(fixture, 3_000_000);
      await sign(fixture.owner, proposalId);
      await sign(fixture.tenant, proposalId);

      await expectTermsAgreed(t, fixture.negotiationId, proposalId);
    },
  );

  it("accepts a secondary-persona OWNER at link time, the step the signing check later contradicts", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);
    const secondaryOwner = await insertMultiPersonaUser(
      t,
      "user_negotiation_linkable_owner",
      USER_TYPE.TENANT,
      USER_TYPE.OWNER,
    );
    const plainTenant = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        workos_user_id: "user_negotiation_plain_tenant",
        user_type: USER_TYPE.TENANT,
        name: "Plain tenant",
        status: USER_STATUS.ACTIVE,
        must_change_password: false,
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.negotiationId, { owner_user_id: undefined });
    });

    await expect(
      fixture.admin.mutation(api.negotiations.linkOwnerToNegotiation, {
        negotiation_id: fixture.negotiationId,
        owner_user_id: plainTenant,
      }),
    ).rejects.toThrow("Linked user must be an OWNER");

    await fixture.admin.mutation(api.negotiations.linkOwnerToNegotiation, {
      negotiation_id: fixture.negotiationId,
      owner_user_id: secondaryOwner.userId,
    });
    const linked = await t.run(async (ctx) => ctx.db.get(fixture.negotiationId));
    expect(linked?.owner_user_id).toBe(secondaryOwner.userId);
  });

  it("rejects an OWNER who is not the linked owner while the linked owner still signs", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        workos_user_id: "user_negotiation_other_owner",
        user_type: USER_TYPE.OWNER,
        name: "Other owner",
        status: USER_STATUS.ACTIVE,
        must_change_password: false,
      }),
    );
    const otherOwner = t.withIdentity({
      subject: "user_negotiation_other_owner",
      issuer: WORKOS_ISSUER,
    });
    const proposalId = await createAndShareProposal(fixture, 3_000_000);

    await expect(sign(otherOwner, proposalId)).rejects.toThrow(
      "Only linked tenant/owner can sign proposal terms",
    );
    await sign(fixture.owner, proposalId);

    const state = await readState(t, fixture.negotiationId, proposalId);
    expect(state.signatures.map((signature) => signature.user_role)).toEqual(["OWNER"]);
  });

  it("rejects a second signature by the same party on the same proposal", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);
    const proposalId = await createAndShareProposal(fixture, 3_000_000);

    await sign(fixture.tenant, proposalId);
    await expect(sign(fixture.tenant, proposalId)).rejects.toThrow(
      "You have already signed this proposal",
    );

    const state = await readState(t, fixture.negotiationId, proposalId);
    expect(state.signatures).toHaveLength(1);
    expect(state.negotiation?.status).toBe(NEGOTIATION_STATUS.TERMS_PROPOSED);
  });

  it("rejects an owner signature on a proposal shared only to the tenant room", async () => {
    const t = createTestBackend();
    const fixture = await createNegotiationFixture(t);
    const proposalId = await fixture.admin.mutation(api.negotiationProposals.create, {
      negotiation_id: fixture.negotiationId,
      monthly_rent_paise: 3_000_000,
      security_deposit_paise: 6_000_000,
      security_deposit_months: 2,
      lock_in_period_months: 11,
      notice_period_months: 1,
      move_in_date: Date.now() + 30 * 24 * 60 * 60 * 1000,
      maintenance_charges_paise: 250_000,
      maintenance_paid_by: "TENANT",
      rent_escalation_type: "NONE",
      rent_escalation_value: 0,
      furnishing_terms: "Unfurnished",
      brokerage_tenant_side_paise: 0,
      brokerage_owner_side_paise: 0,
      token_advance_amount_paise: 0,
    });
    await fixture.admin.mutation(api.negotiationProposals.share, {
      proposal_id: proposalId,
      room_types: [NEGOTIATION_ROOM_TYPE.OPS_TENANT],
    });

    await expect(sign(fixture.owner, proposalId)).rejects.toThrow(
      "Proposal is not shared to your room",
    );
    await sign(fixture.tenant, proposalId);

    const state = await readState(t, fixture.negotiationId, proposalId);
    expect(state.signatures.map((signature) => signature.user_role)).toEqual(["TENANT"]);
    expect(state.proposal?.status).toBe(NEGOTIATION_PROPOSAL_STATUS.SHARED);
  });
});
