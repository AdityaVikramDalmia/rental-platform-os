// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./functions";
// eslint-disable-next-line no-restricted-imports -- cleanupNegotiations intentionally bypasses audit triggers (raw ctx.db) for bulk demo-data teardown; every other mutation in this file uses the wrapped `internalMutation` from "./functions".
import { internalMutation as rawInternalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

export const cleanupNegotiations = rawInternalMutation({
  args: {},
  handler: async (ctx) => {
    const childTables = [
      "negotiation_token_records",
      "negotiation_terms_signatures",
      "negotiation_terms_proposals",
    ] as const;

    for (const table of childTables) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
    }

    const negotiations = await ctx.db.query("negotiations").collect();
    for (const neg of negotiations) {
      await ctx.db.delete(neg._id);
    }

    console.log(`  🧹 Cleaned up ${negotiations.length} negotiations`);
  },
});
import {
  DEMO_PHONES as SHARED_DEMO_PHONES,
  daysAgo,
  ensureSeedRecord,
  lookupBuildingInSociety,
  lookupSocietyDoc,
} from "./seedHelpers";

const DAY_MS = 24 * 60 * 60 * 1000;

const DEMO_EMAILS = {
  founder_one: "admin@example.com",
  tenant1: "tenant1@test.demorentals.com",
  tenant2: "tenant2@test.demorentals.com",
  owner1: "owner1@test.demorentals.com",
  owner2: "owner2@test.demorentals.com",
} as const;

const DEMO_PHONES = {
  ops1: "8888888888",
  inquiryVisitCompleted: "9300000007",
  inquirySubmitted1: "9300000001",
  inquirySubmitted2: "9300000002",
  inquiryReviewed: "9300000003",
} as const;

type NegotiationRoomType = "OPS_TENANT" | "OPS_OWNER" | "COMBINED";

type SeedUsers = {
  founder_one: Doc<"users">;
  ops1: Doc<"users">;
  tenant1: Doc<"users">;
  tenant2: Doc<"users">;
  owner1: Doc<"users">;
  owner2: Doc<"users">;
};

type NegotiationScenario = {
  key: "NEG_1" | "NEG_2" | "NEG_3" | "NEG_4";
  inquiry: Doc<"tenant_inquiries">;
  listing: Doc<"listings">;
  tenant_user_id: Id<"users">;
  owner_user_id?: Id<"users">;
  negotiation_id: Id<"negotiations">;
  channels: {
    ops_tenant: Id<"chat_channels">;
    ops_owner: Id<"chat_channels">;
    combined: Id<"chat_channels">;
  };
};

type SeedNegotiationResult = {
  users: SeedUsers;
  scenarios: {
    neg1: NegotiationScenario;
    neg2: NegotiationScenario;
    neg3: NegotiationScenario;
    neg4: NegotiationScenario;
  };
  stats: {
    negotiations: number;
    channels: number;
    messagesInserted: number;
    proposals: number;
    signatures: number;
    tokenRecords: number;
  };
};

type ProposalUpsertInput = {
  negotiation_id: Id<"negotiations">;
  version: number;
  status: Doc<"negotiation_terms_proposals">["status"];
  monthly_rent_paise: number;
  security_deposit_paise: number;
  security_deposit_months: number;
  lock_in_period_months: number;
  notice_period_months: number;
  move_in_date: number;
  maintenance_charges_paise: number;
  maintenance_paid_by: Doc<"negotiation_terms_proposals">["maintenance_paid_by"];
  rent_escalation_type: Doc<"negotiation_terms_proposals">["rent_escalation_type"];
  rent_escalation_value: number;
  furnishing_terms: string;
  brokerage_tenant_side_paise: number;
  brokerage_owner_side_paise: number;
  token_advance_amount_paise: number;
  special_conditions?: string;
  created_by_admin_id: Id<"users">;
  created_at: number;
  shared_to_rooms?: NegotiationRoomType[];
  shared_at?: number;
  is_locked: boolean;
  locked_at?: number;
  is_deleted: boolean;
};

type MessageSeed = {
  channel_id: Id<"chat_channels">;
  sender_user_id: Id<"users">;
  sender_role: Doc<"chat_messages">["sender_role"];
  text: string;
  created_at: number;
};

async function getUserByEmail(ctx: MutationCtx, email: string): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
}

async function getUserByPhone(
  ctx: MutationCtx,
  phone: string,
  userType: Doc<"users">["user_type"],
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .filter((q) => q.eq(q.field("user_type"), userType))
    .first();
}

async function requireListing(
  ctx: MutationCtx,
  listingId: Id<"listings">,
): Promise<Doc<"listings">> {
  const listing = await ctx.db.get(listingId);
  if (!listing) {
    throw new Error("seedDemoNegotiations: Required listing missing");
  }
  return listing;
}

async function getInquiryByPhone(
  ctx: MutationCtx,
  phone: string,
  preferredStatus?: Doc<"tenant_inquiries">["status"],
): Promise<Doc<"tenant_inquiries"> | null> {
  const inquiries = await ctx.db
    .query("tenant_inquiries")
    .withIndex("by_tenant_phone", (q) => q.eq("tenant_phone", phone))
    .collect();

  if (inquiries.length === 0) {
    return null;
  }

  const sorted = [...inquiries].sort((a, b) => b._creationTime - a._creationTime);
  if (!preferredStatus) {
    return sorted[0];
  }

  return sorted.find((inquiry) => inquiry.status === preferredStatus) ?? sorted[0];
}

async function ensureInquiryTenant(
  ctx: MutationCtx,
  inquiry: Doc<"tenant_inquiries">,
  fallbackTenantId: Id<"users">,
): Promise<Id<"users">> {
  if (inquiry.tenant_id) {
    return inquiry.tenant_id;
  }

  await ctx.db.patch(inquiry._id, {
    tenant_id: fallbackTenantId,
    updated_at: Date.now(),
  });

  return fallbackTenantId;
}

async function upsertNegotiation(
  ctx: MutationCtx,
  args: {
    inquiry_id: Id<"tenant_inquiries">;
    listing_id: Id<"listings">;
    tenant_user_id: Id<"users">;
    owner_user_id?: Id<"users">;
    initiated_by_admin_id: Id<"users">;
    status: Doc<"negotiations">["status"];
    initiated_at: number;
    terms_agreed_at?: number;
    ready_for_closure_at?: number;
    last_activity_at: number;
    police_verification_status?: Doc<"negotiations">["police_verification_status"];
    society_noc_status?: Doc<"negotiations">["society_noc_status"];
    owner_kyc_status?: Doc<"negotiations">["owner_kyc_status"];
    agreement_drafting_status?: string;
    stamp_registration_status?: string;
    rent_agreement_status?: Doc<"negotiations">["rent_agreement_status"];
    key_handover_status?: Doc<"negotiations">["key_handover_status"];
    move_in_inspection_status?: Doc<"negotiations">["move_in_inspection_status"];
    move_in_inspection_notes?: string;
  },
): Promise<Id<"negotiations">> {
  const existingForInquiry = await ctx.db
    .query("negotiations")
    .withIndex("by_tenant_inquiry_id", (q) => q.eq("tenant_inquiry_id", args.inquiry_id))
    .collect();

  const existing =
    existingForInquiry.find(
      (item) =>
        !item.is_deleted &&
        item.initiated_by_admin_id.toString() === args.initiated_by_admin_id.toString(),
    ) ?? existingForInquiry.find((item) => !item.is_deleted);

  const payload: Partial<Doc<"negotiations">> = {
    tenant_inquiry_id: args.inquiry_id,
    listing_id: args.listing_id,
    tenant_user_id: args.tenant_user_id,
    owner_user_id: args.owner_user_id,
    initiated_by_admin_id: args.initiated_by_admin_id,
    status: args.status,
    failure_reason: undefined,
    failure_notes: undefined,
    ops_tenant_channel_id: undefined,
    ops_owner_channel_id: undefined,
    combined_channel_id: undefined,
    active_proposal_id: undefined,
    police_verification_status: args.police_verification_status,
    society_noc_status: args.society_noc_status,
    owner_kyc_status: args.owner_kyc_status,
    agreement_drafting_status: args.agreement_drafting_status,
    stamp_registration_status: args.stamp_registration_status,
    rent_agreement_storage_id: undefined,
    rent_agreement_status: args.rent_agreement_status,
    key_handover_status: args.key_handover_status,
    move_in_inspection_status: args.move_in_inspection_status,
    move_in_inspection_notes: args.move_in_inspection_notes,
    police_verification_waive_reason: undefined,
    society_noc_waive_reason: undefined,
    owner_kyc_waive_reason: undefined,
    rent_agreement_waive_reason: undefined,
    key_handover_waive_reason: undefined,
    move_in_inspection_waive_reason: undefined,
    initiated_at: args.initiated_at,
    terms_agreed_at: args.terms_agreed_at,
    ready_for_closure_at: args.ready_for_closure_at,
    failed_at: undefined,
    last_activity_at: args.last_activity_at,
    stale_flagged: false,
    rounds_flagged: false,
    is_stale: false,
    too_many_rounds: false,
    token_without_agreement: false,
    escalation_flags_updated_at: args.last_activity_at,
    flag_dismissed_at: undefined,
    flag_dismissed_reason: undefined,
    is_deleted: false,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }

  return await ctx.db.insert("negotiations", {
    tenant_inquiry_id: args.inquiry_id,
    listing_id: args.listing_id,
    tenant_user_id: args.tenant_user_id,
    owner_user_id: args.owner_user_id,
    initiated_by_admin_id: args.initiated_by_admin_id,
    status: args.status,
    failure_reason: undefined,
    failure_notes: undefined,
    ops_tenant_channel_id: undefined,
    ops_owner_channel_id: undefined,
    combined_channel_id: undefined,
    active_proposal_id: undefined,
    police_verification_status: args.police_verification_status,
    society_noc_status: args.society_noc_status,
    owner_kyc_status: args.owner_kyc_status,
    agreement_drafting_status: args.agreement_drafting_status,
    stamp_registration_status: args.stamp_registration_status,
    rent_agreement_storage_id: undefined,
    rent_agreement_status: args.rent_agreement_status,
    key_handover_status: args.key_handover_status,
    move_in_inspection_status: args.move_in_inspection_status,
    move_in_inspection_notes: args.move_in_inspection_notes,
    police_verification_waive_reason: undefined,
    society_noc_waive_reason: undefined,
    owner_kyc_waive_reason: undefined,
    rent_agreement_waive_reason: undefined,
    key_handover_waive_reason: undefined,
    move_in_inspection_waive_reason: undefined,
    initiated_at: args.initiated_at,
    terms_agreed_at: args.terms_agreed_at,
    ready_for_closure_at: args.ready_for_closure_at,
    failed_at: undefined,
    last_activity_at: args.last_activity_at,
    stale_flagged: false,
    rounds_flagged: false,
    is_stale: false,
    too_many_rounds: false,
    token_without_agreement: false,
    escalation_flags_updated_at: args.last_activity_at,
    flag_dismissed_at: undefined,
    flag_dismissed_reason: undefined,
    is_deleted: false,
  });
}

async function ensureNegotiationRoom(
  ctx: MutationCtx,
  args: {
    inquiry_id: Id<"tenant_inquiries">;
    negotiation_id: Id<"negotiations">;
    room_type: NegotiationRoomType;
    created_by_admin_id: Id<"users">;
    created_at: number;
  },
): Promise<{ id: Id<"chat_channels">; inserted: boolean }> {
  const existingChannels = await ctx.db
    .query("chat_channels")
    .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", args.negotiation_id))
    .collect();

  const existing = existingChannels.find((channel) => channel.channel_type === args.room_type);

  if (existing) {
    await ctx.db.patch(existing._id, {
      inquiry_id: args.inquiry_id,
      channel_type: args.room_type,
      negotiation_id: args.negotiation_id,
      status: "ACTIVE",
      created_by_admin_id: args.created_by_admin_id,
      created_at: args.created_at,
    });
    return { id: existing._id, inserted: false };
  }

  const channelId = await ctx.db.insert("chat_channels", {
    inquiry_id: args.inquiry_id,
    channel_type: args.room_type,
    negotiation_id: args.negotiation_id,
    status: "ACTIVE",
    created_by_admin_id: args.created_by_admin_id,
    created_at: args.created_at,
  });

  return { id: channelId, inserted: true };
}

async function ensureChatMessage(
  ctx: MutationCtx,
  message: MessageSeed,
): Promise<{ inserted: boolean; id: Id<"chat_messages"> }> {
  const existing = await ctx.db
    .query("chat_messages")
    .withIndex("by_channel_id", (q) => q.eq("channel_id", message.channel_id))
    .filter((q) =>
      q.and(
        q.eq(q.field("sender_user_id"), message.sender_user_id),
        q.eq(q.field("sender_role"), message.sender_role),
        q.eq(q.field("original_content"), message.text),
      ),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "DELIVERED",
      masked_content: message.text,
      admin_review_required: false,
      is_ai_processed: true,
      is_impersonated: false,
      is_deleted: false,
      created_at: message.created_at,
      delivered_at: message.created_at,
    });
    return { inserted: false, id: existing._id };
  }

  const messageId = await ctx.db.insert("chat_messages", {
    channel_id: message.channel_id,
    sender_user_id: message.sender_user_id,
    sender_role: message.sender_role,
    original_content: message.text,
    masked_content: message.text,
    batch_id: undefined,
    status: "DELIVERED",
    failure_reason: undefined,
    admin_review_required: false,
    is_ai_processed: true,
    is_impersonated: false,
    impersonated_by_admin_id: undefined,
    is_deleted: false,
    created_at: message.created_at,
    delivered_at: message.created_at,
  });

  return { inserted: true, id: messageId };
}

async function upsertProposal(
  ctx: MutationCtx,
  input: ProposalUpsertInput,
): Promise<{ id: Id<"negotiation_terms_proposals">; inserted: boolean }> {
  const existing = await ctx.db
    .query("negotiation_terms_proposals")
    .withIndex("by_negotiation_and_version", (q) =>
      q.eq("negotiation_id", input.negotiation_id).eq("version", input.version),
    )
    .first();

  const payload: Partial<Doc<"negotiation_terms_proposals">> = {
    status: input.status,
    monthly_rent_paise: input.monthly_rent_paise,
    security_deposit_paise: input.security_deposit_paise,
    security_deposit_months: input.security_deposit_months,
    lock_in_period_months: input.lock_in_period_months,
    notice_period_months: input.notice_period_months,
    move_in_date: input.move_in_date,
    maintenance_charges_paise: input.maintenance_charges_paise,
    maintenance_paid_by: input.maintenance_paid_by,
    rent_escalation_type: input.rent_escalation_type,
    rent_escalation_value: input.rent_escalation_value,
    furnishing_terms: input.furnishing_terms,
    brokerage_tenant_side_paise: input.brokerage_tenant_side_paise,
    brokerage_owner_side_paise: input.brokerage_owner_side_paise,
    token_advance_amount_paise: input.token_advance_amount_paise,
    special_conditions: input.special_conditions,
    created_by_admin_id: input.created_by_admin_id,
    created_at: input.created_at,
    shared_to_rooms: input.shared_to_rooms,
    shared_at: input.shared_at,
    is_locked: input.is_locked,
    locked_at: input.locked_at,
    is_deleted: input.is_deleted,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return { id: existing._id, inserted: false };
  }

  const proposalId = await ctx.db.insert("negotiation_terms_proposals", {
    negotiation_id: input.negotiation_id,
    version: input.version,
    status: input.status,
    monthly_rent_paise: input.monthly_rent_paise,
    security_deposit_paise: input.security_deposit_paise,
    security_deposit_months: input.security_deposit_months,
    lock_in_period_months: input.lock_in_period_months,
    notice_period_months: input.notice_period_months,
    move_in_date: input.move_in_date,
    maintenance_charges_paise: input.maintenance_charges_paise,
    maintenance_paid_by: input.maintenance_paid_by,
    rent_escalation_type: input.rent_escalation_type,
    rent_escalation_value: input.rent_escalation_value,
    furnishing_terms: input.furnishing_terms,
    brokerage_tenant_side_paise: input.brokerage_tenant_side_paise,
    brokerage_owner_side_paise: input.brokerage_owner_side_paise,
    token_advance_amount_paise: input.token_advance_amount_paise,
    special_conditions: input.special_conditions,
    created_by_admin_id: input.created_by_admin_id,
    created_at: input.created_at,
    shared_to_rooms: input.shared_to_rooms,
    shared_at: input.shared_at,
    is_locked: input.is_locked,
    locked_at: input.locked_at,
    is_deleted: input.is_deleted,
  });

  return { id: proposalId, inserted: true };
}

async function ensureProposalSignature(
  ctx: MutationCtx,
  args: {
    proposal_id: Id<"negotiation_terms_proposals">;
    negotiation_id: Id<"negotiations">;
    user_id: Id<"users">;
    user_role: Doc<"negotiation_terms_signatures">["user_role"];
    signed_at: number;
    agreement_text: string;
    proposal_version: number;
  },
): Promise<{ id: Id<"negotiation_terms_signatures">; inserted: boolean }> {
  const existing = await ctx.db
    .query("negotiation_terms_signatures")
    .withIndex("by_proposal_user", (q) =>
      q.eq("proposal_id", args.proposal_id).eq("user_id", args.user_id).eq("is_deleted", false),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      user_role: args.user_role,
      signed_at: args.signed_at,
      agreement_text: args.agreement_text,
      proposal_version: args.proposal_version,
      is_deleted: false,
    });
    return { id: existing._id, inserted: false };
  }

  const signatureId = await ctx.db.insert("negotiation_terms_signatures", {
    proposal_id: args.proposal_id,
    negotiation_id: args.negotiation_id,
    user_id: args.user_id,
    user_role: args.user_role,
    signed_at: args.signed_at,
    agreement_text: args.agreement_text,
    proposal_version: args.proposal_version,
    is_deleted: false,
  });

  return { id: signatureId, inserted: true };
}

async function ensureTokenRecord(
  ctx: MutationCtx,
  args: {
    negotiation_id: Id<"negotiations">;
    amount_paise: number;
    collected_at: number;
    collection_method: Doc<"negotiation_token_records">["collection_method"];
    refund_policy: Doc<"negotiation_token_records">["refund_policy"];
    refund_days?: number;
    refund_percentage?: number;
    tenant_agreed_at: number;
    collected_by_admin_id: Id<"users">;
    notes: string;
  },
): Promise<{ id: Id<"negotiation_token_records">; inserted: boolean }> {
  const existingRecords = await ctx.db
    .query("negotiation_token_records")
    .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", args.negotiation_id))
    .collect();

  const existing = existingRecords.find(
    (record) =>
      !record.is_deleted &&
      record.status === "COLLECTED" &&
      record.amount_paise === args.amount_paise,
  );

  if (existing) {
    await ctx.db.patch(existing._id, {
      collected_at: args.collected_at,
      collection_method: args.collection_method,
      refund_policy: args.refund_policy,
      refund_days: args.refund_days,
      refund_percentage: args.refund_percentage,
      tenant_agreed_at: args.tenant_agreed_at,
      collected_by_admin_id: args.collected_by_admin_id,
      notes: args.notes,
      is_deleted: false,
    });
    return { id: existing._id, inserted: false };
  }

  const tokenId = await ctx.db.insert("negotiation_token_records", {
    negotiation_id: args.negotiation_id,
    amount_paise: args.amount_paise,
    collected_at: args.collected_at,
    collection_method: args.collection_method,
    refund_policy: args.refund_policy,
    refund_days: args.refund_days,
    refund_percentage: args.refund_percentage,
    tenant_agreed_at: args.tenant_agreed_at,
    status: "COLLECTED",
    collected_by_admin_id: args.collected_by_admin_id,
    notes: args.notes,
    is_deleted: false,
  });

  return { id: tokenId, inserted: true };
}

async function ensureInvitePending(
  ctx: MutationCtx,
  args: {
    inquiry_id: Id<"tenant_inquiries">;
    channel_id: Id<"chat_channels">;
    owner_expected_email?: string;
    created_by_admin_id: Id<"users">;
    created_at: number;
    expires_at: number;
  },
): Promise<{ id: Id<"owner_invites">; inserted: boolean }> {
  const existingPending = await ctx.db
    .query("owner_invites")
    .withIndex("by_inquiry_and_status", (q) =>
      q.eq("inquiry_id", args.inquiry_id).eq("status", "PENDING"),
    )
    .collect();

  const activePending = existingPending.find((invite) => invite.expires_at > Date.now());
  if (activePending) {
    await ctx.db.patch(activePending._id, {
      channel_id: args.channel_id,
      owner_expected_email: args.owner_expected_email,
      expires_at: args.expires_at,
      created_by_admin_id: args.created_by_admin_id,
      created_at: args.created_at,
    });
    return { id: activePending._id, inserted: false };
  }

  const inviteId = await ctx.db.insert("owner_invites", {
    inquiry_id: args.inquiry_id,
    channel_id: args.channel_id,
    invite_token: crypto.randomUUID(),
    owner_expected_email: args.owner_expected_email,
    identity_verified: undefined,
    status: "PENDING",
    expires_at: args.expires_at,
    consumed_at: undefined,
    consumed_by_user_id: undefined,
    created_by_admin_id: args.created_by_admin_id,
    created_at: args.created_at,
  });

  return { id: inviteId, inserted: true };
}

async function ensureInviteConsumed(
  ctx: MutationCtx,
  args: {
    inquiry_id: Id<"tenant_inquiries">;
    channel_id: Id<"chat_channels">;
    owner_expected_email?: string;
    consumed_by_user_id: Id<"users">;
    created_by_admin_id: Id<"users">;
    created_at: number;
    consumed_at: number;
    expires_at: number;
  },
): Promise<{ id: Id<"owner_invites">; inserted: boolean }> {
  const existingConsumed = await ctx.db
    .query("owner_invites")
    .withIndex("by_inquiry_and_status", (q) =>
      q.eq("inquiry_id", args.inquiry_id).eq("status", "CONSUMED"),
    )
    .collect();

  const existing = existingConsumed[0];
  if (existing) {
    await ctx.db.patch(existing._id, {
      channel_id: args.channel_id,
      owner_expected_email: args.owner_expected_email,
      identity_verified: true,
      consumed_at: args.consumed_at,
      consumed_by_user_id: args.consumed_by_user_id,
      created_by_admin_id: args.created_by_admin_id,
      created_at: args.created_at,
      expires_at: args.expires_at,
    });
    return { id: existing._id, inserted: false };
  }

  const inviteId = await ctx.db.insert("owner_invites", {
    inquiry_id: args.inquiry_id,
    channel_id: args.channel_id,
    invite_token: crypto.randomUUID(),
    owner_expected_email: args.owner_expected_email,
    identity_verified: true,
    status: "CONSUMED",
    expires_at: args.expires_at,
    consumed_at: args.consumed_at,
    consumed_by_user_id: args.consumed_by_user_id,
    created_by_admin_id: args.created_by_admin_id,
    created_at: args.created_at,
  });

  return { id: inviteId, inserted: true };
}

async function ensureChecklistWithSeedPrefix(
  ctx: MutationCtx,
  args: {
    inquiry_id: Id<"tenant_inquiries">;
    channel_id: Id<"chat_channels">;
    seed_prefix: string;
    status: Doc<"deal_checklists">["status"];
    items: Doc<"deal_checklists">["items"];
    created_by_admin_id: Id<"users">;
    created_at: number;
    shared_at?: number;
    approved_at?: number;
  },
): Promise<{ id: Id<"deal_checklists">; inserted: boolean }> {
  const existingByInquiry = await ctx.db
    .query("deal_checklists")
    .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", args.inquiry_id))
    .collect();

  const existingSeedChecklist = existingByInquiry.find((checklist) =>
    checklist.items.some((item) => item.item_id.startsWith(args.seed_prefix)),
  );

  if (existingSeedChecklist) {
    await ctx.db.patch(existingSeedChecklist._id, {
      channel_id: args.channel_id,
      status: args.status,
      items: args.items,
      created_by_admin_id: args.created_by_admin_id,
      created_at: args.created_at,
      shared_at: args.shared_at,
      approved_at: args.approved_at,
    });
    return { id: existingSeedChecklist._id, inserted: false };
  }

  const latestVersion = await ctx.db
    .query("deal_checklists")
    .withIndex("by_inquiry_and_version", (q) => q.eq("inquiry_id", args.inquiry_id))
    .order("desc")
    .first();

  const checklistId = await ctx.db.insert("deal_checklists", {
    inquiry_id: args.inquiry_id,
    channel_id: args.channel_id,
    version: (latestVersion?.version ?? 0) + 1,
    previous_version_id: undefined,
    items: args.items,
    status: args.status,
    created_by_admin_id: args.created_by_admin_id,
    created_at: args.created_at,
    shared_at: args.shared_at,
    approved_at: args.approved_at,
  });

  return { id: checklistId, inserted: true };
}

async function ensureChecklistSignature(
  ctx: MutationCtx,
  args: {
    checklist_id: Id<"deal_checklists">;
    signer_user_id: Id<"users">;
    signer_role: Doc<"deal_checklist_signatures">["signer_role"];
    signature_hash: string;
    signed_at: number;
    ip_address?: string;
  },
): Promise<{ id: Id<"deal_checklist_signatures">; inserted: boolean }> {
  const existing = await ctx.db
    .query("deal_checklist_signatures")
    .withIndex("by_signer", (q) =>
      q.eq("signer_user_id", args.signer_user_id).eq("checklist_id", args.checklist_id),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      signer_role: args.signer_role,
      signature_hash: args.signature_hash,
      signed_at: args.signed_at,
      ip_address: args.ip_address,
    });
    return { id: existing._id, inserted: false };
  }

  const signatureId = await ctx.db.insert("deal_checklist_signatures", {
    checklist_id: args.checklist_id,
    signer_user_id: args.signer_user_id,
    signer_role: args.signer_role,
    signature_hash: args.signature_hash,
    signed_at: args.signed_at,
    ip_address: args.ip_address,
  });

  return { id: signatureId, inserted: true };
}

async function loadSeedUsers(ctx: MutationCtx): Promise<SeedUsers> {
  const [founder_one, ops1, tenant1, tenant2, owner1, owner2] = await Promise.all([
    getUserByEmail(ctx, DEMO_EMAILS.founder_one),
    getUserByPhone(ctx, DEMO_PHONES.ops1, "OPS"),
    getUserByEmail(ctx, DEMO_EMAILS.tenant1),
    getUserByEmail(ctx, DEMO_EMAILS.tenant2),
    getUserByEmail(ctx, DEMO_EMAILS.owner1),
    getUserByEmail(ctx, DEMO_EMAILS.owner2),
  ]);

  if (!founder_one || founder_one.user_type !== "ADMIN") {
    throw new Error("seedDemoNegotiations: Missing admin user admin@example.com");
  }
  if (!ops1 || ops1.user_type !== "OPS") {
    throw new Error("seedDemoNegotiations: Missing OPS user 8888888888");
  }
  if (!tenant1 || tenant1.user_type !== "TENANT") {
    throw new Error("seedDemoNegotiations: Missing tenant user tenant1@test.demorentals.com");
  }
  if (!tenant2 || tenant2.user_type !== "TENANT") {
    throw new Error("seedDemoNegotiations: Missing tenant user tenant2@test.demorentals.com");
  }
  if (!owner1 || owner1.user_type !== "OWNER") {
    throw new Error("seedDemoNegotiations: Missing owner user owner1@test.demorentals.com");
  }
  if (!owner2 || owner2.user_type !== "OWNER") {
    throw new Error("seedDemoNegotiations: Missing owner user owner2@test.demorentals.com");
  }

  return {
    founder_one,
    ops1,
    tenant1,
    tenant2,
    owner1,
    owner2,
  };
}

async function ensureNegotiationScenarios(ctx: MutationCtx): Promise<SeedNegotiationResult> {
  const now = Date.now();
  const users = await loadSeedUsers(ctx);

  const [inquiry1, inquiry2, inquiry3, inquiry4] = await Promise.all([
    getInquiryByPhone(ctx, DEMO_PHONES.inquiryVisitCompleted, "VISIT_COMPLETED"),
    getInquiryByPhone(ctx, DEMO_PHONES.inquirySubmitted1, "SUBMITTED"),
    getInquiryByPhone(ctx, DEMO_PHONES.inquirySubmitted2, "SUBMITTED"),
    getInquiryByPhone(ctx, DEMO_PHONES.inquiryReviewed, "REVIEWED"),
  ]);

  if (!inquiry1 || !inquiry2 || !inquiry3 || !inquiry4) {
    throw new Error(
      "seedDemoNegotiations: Missing expected tenant inquiries. Run seedDemo:seedMega first.",
    );
  }

  const [listing1, listing2, listing3, listing4] = await Promise.all([
    requireListing(ctx, inquiry1.listing_id),
    requireListing(ctx, inquiry2.listing_id),
    requireListing(ctx, inquiry3.listing_id),
    requireListing(ctx, inquiry4.listing_id),
  ]);

  const tenantForInquiry1 = await ensureInquiryTenant(ctx, inquiry1, users.tenant1._id);
  const tenantForInquiry2 = await ensureInquiryTenant(ctx, inquiry2, users.tenant1._id);
  const tenantForInquiry3 = await ensureInquiryTenant(ctx, inquiry3, users.tenant2._id);
  const tenantForInquiry4 = await ensureInquiryTenant(ctx, inquiry4, users.tenant2._id);

  const neg1Id = await upsertNegotiation(ctx, {
    inquiry_id: inquiry1._id,
    listing_id: listing1._id,
    tenant_user_id: tenantForInquiry1,
    owner_user_id: users.owner2._id,
    initiated_by_admin_id: users.founder_one._id,
    status: "ACTIVE",
    initiated_at: now - 7 * DAY_MS,
    last_activity_at: now - 90 * 60 * 1000,
  });

  const neg2Id = await upsertNegotiation(ctx, {
    inquiry_id: inquiry2._id,
    listing_id: listing2._id,
    tenant_user_id: tenantForInquiry2,
    owner_user_id: users.owner1._id,
    initiated_by_admin_id: users.founder_one._id,
    status: "TERMS_PROPOSED",
    initiated_at: now - 6 * DAY_MS,
    last_activity_at: now - 26 * 60 * 60 * 1000,
  });

  const neg3Id = await upsertNegotiation(ctx, {
    inquiry_id: inquiry3._id,
    listing_id: listing3._id,
    tenant_user_id: tenantForInquiry3,
    owner_user_id: users.owner2._id,
    initiated_by_admin_id: users.founder_one._id,
    status: "TOKEN_COLLECTED",
    initiated_at: now - 5 * DAY_MS,
    terms_agreed_at: now - 3 * DAY_MS,
    last_activity_at: now - 12 * 60 * 60 * 1000,
    police_verification_status: "IN_PROGRESS",
    society_noc_status: "PENDING",
    owner_kyc_status: "VERIFIED",
    agreement_drafting_status: "IN_PROGRESS",
    stamp_registration_status: "PENDING",
    rent_agreement_status: "DRAFT_READY",
    key_handover_status: "PENDING",
    move_in_inspection_status: "PENDING",
  });

  const neg4Id = await upsertNegotiation(ctx, {
    inquiry_id: inquiry4._id,
    listing_id: listing4._id,
    tenant_user_id: tenantForInquiry4,
    owner_user_id: users.owner1._id,
    initiated_by_admin_id: users.founder_one._id,
    status: "READY_FOR_CLOSURE",
    initiated_at: now - 4 * DAY_MS,
    terms_agreed_at: now - 3 * DAY_MS,
    ready_for_closure_at: now - 3 * 60 * 60 * 1000,
    last_activity_at: now - 90 * 60 * 1000,
    police_verification_status: "COMPLETED",
    society_noc_status: "OBTAINED",
    owner_kyc_status: "VERIFIED",
    agreement_drafting_status: "VERIFIED",
    stamp_registration_status: "VERIFIED",
    rent_agreement_status: "STAMP_REGISTERED",
    key_handover_status: "COMPLETED",
    move_in_inspection_status: "COMPLETED",
    move_in_inspection_notes: "Final walkthrough completed with no pending issues.",
  });

  const channelSeeds: Array<{
    scenario: "NEG_1" | "NEG_2" | "NEG_3" | "NEG_4";
    inquiry_id: Id<"tenant_inquiries">;
    negotiation_id: Id<"negotiations">;
    room_type: NegotiationRoomType;
    created_at: number;
  }> = [
    {
      scenario: "NEG_1",
      inquiry_id: inquiry1._id,
      negotiation_id: neg1Id,
      room_type: "OPS_TENANT",
      created_at: now - 7 * DAY_MS,
    },
    {
      scenario: "NEG_1",
      inquiry_id: inquiry1._id,
      negotiation_id: neg1Id,
      room_type: "OPS_OWNER",
      created_at: now - 7 * DAY_MS + 10 * 60 * 1000,
    },
    {
      scenario: "NEG_1",
      inquiry_id: inquiry1._id,
      negotiation_id: neg1Id,
      room_type: "COMBINED",
      created_at: now - 7 * DAY_MS + 20 * 60 * 1000,
    },
    {
      scenario: "NEG_2",
      inquiry_id: inquiry2._id,
      negotiation_id: neg2Id,
      room_type: "OPS_TENANT",
      created_at: now - 6 * DAY_MS,
    },
    {
      scenario: "NEG_2",
      inquiry_id: inquiry2._id,
      negotiation_id: neg2Id,
      room_type: "OPS_OWNER",
      created_at: now - 6 * DAY_MS + 10 * 60 * 1000,
    },
    {
      scenario: "NEG_2",
      inquiry_id: inquiry2._id,
      negotiation_id: neg2Id,
      room_type: "COMBINED",
      created_at: now - 6 * DAY_MS + 20 * 60 * 1000,
    },
    {
      scenario: "NEG_3",
      inquiry_id: inquiry3._id,
      negotiation_id: neg3Id,
      room_type: "OPS_TENANT",
      created_at: now - 5 * DAY_MS,
    },
    {
      scenario: "NEG_3",
      inquiry_id: inquiry3._id,
      negotiation_id: neg3Id,
      room_type: "OPS_OWNER",
      created_at: now - 5 * DAY_MS + 10 * 60 * 1000,
    },
    {
      scenario: "NEG_3",
      inquiry_id: inquiry3._id,
      negotiation_id: neg3Id,
      room_type: "COMBINED",
      created_at: now - 5 * DAY_MS + 20 * 60 * 1000,
    },
    {
      scenario: "NEG_4",
      inquiry_id: inquiry4._id,
      negotiation_id: neg4Id,
      room_type: "OPS_TENANT",
      created_at: now - 4 * DAY_MS,
    },
    {
      scenario: "NEG_4",
      inquiry_id: inquiry4._id,
      negotiation_id: neg4Id,
      room_type: "OPS_OWNER",
      created_at: now - 4 * DAY_MS + 10 * 60 * 1000,
    },
    {
      scenario: "NEG_4",
      inquiry_id: inquiry4._id,
      negotiation_id: neg4Id,
      room_type: "COMBINED",
      created_at: now - 4 * DAY_MS + 20 * 60 * 1000,
    },
  ];

  let insertedChannels = 0;
  const channelMap: Record<string, Id<"chat_channels">> = {};

  for (const channelSeed of channelSeeds) {
    const channelResult = await ensureNegotiationRoom(ctx, {
      inquiry_id: channelSeed.inquiry_id,
      negotiation_id: channelSeed.negotiation_id,
      room_type: channelSeed.room_type,
      created_by_admin_id: users.founder_one._id,
      created_at: channelSeed.created_at,
    });
    if (channelResult.inserted) {
      insertedChannels += 1;
    }
    channelMap[`${channelSeed.scenario}_${channelSeed.room_type}`] = channelResult.id;
  }

  await ctx.db.patch(neg1Id, {
    ops_tenant_channel_id: channelMap.NEG_1_OPS_TENANT,
    ops_owner_channel_id: channelMap.NEG_1_OPS_OWNER,
    combined_channel_id: channelMap.NEG_1_COMBINED,
    last_activity_at: now - 90 * 60 * 1000,
  });
  await ctx.db.patch(neg2Id, {
    ops_tenant_channel_id: channelMap.NEG_2_OPS_TENANT,
    ops_owner_channel_id: channelMap.NEG_2_OPS_OWNER,
    combined_channel_id: channelMap.NEG_2_COMBINED,
    last_activity_at: now - 26 * 60 * 60 * 1000,
  });
  await ctx.db.patch(neg3Id, {
    ops_tenant_channel_id: channelMap.NEG_3_OPS_TENANT,
    ops_owner_channel_id: channelMap.NEG_3_OPS_OWNER,
    combined_channel_id: channelMap.NEG_3_COMBINED,
    last_activity_at: now - 12 * 60 * 60 * 1000,
  });
  await ctx.db.patch(neg4Id, {
    ops_tenant_channel_id: channelMap.NEG_4_OPS_TENANT,
    ops_owner_channel_id: channelMap.NEG_4_OPS_OWNER,
    combined_channel_id: channelMap.NEG_4_COMBINED,
    last_activity_at: now - 90 * 60 * 1000,
  });

  const messageSeeds: MessageSeed[] = [
    {
      channel_id: channelMap.NEG_1_OPS_TENANT,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-1] Hi, we have started rent discussion for this inquiry.",
      created_at: now - 7 * DAY_MS + 60 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_1_OPS_TENANT,
      sender_user_id: tenantForInquiry1,
      sender_role: "TENANT",
      text: "[seed-neg-1] I can move in after the 10th next month.",
      created_at: now - 7 * DAY_MS + 70 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_1_OPS_OWNER,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-1] Owner invite generated, waiting for owner to join.",
      created_at: now - 7 * DAY_MS + 90 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_1_COMBINED,
      sender_user_id: users.founder_one._id,
      sender_role: "SYSTEM",
      text: "[seed-neg-1] Combined room opened for negotiation visibility.",
      created_at: now - 7 * DAY_MS + 120 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_1_COMBINED,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-1] First proposal draft in progress.",
      created_at: now - 7 * DAY_MS + 130 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_2_OPS_TENANT,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-2] Sharing revised rent options for your review.",
      created_at: now - 6 * DAY_MS + 50 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_2_OPS_TENANT,
      sender_user_id: tenantForInquiry2,
      sender_role: "TENANT",
      text: "[seed-neg-2] Option B works if maintenance stays fixed.",
      created_at: now - 6 * DAY_MS + 65 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_2_OPS_OWNER,
      sender_user_id: users.owner1._id,
      sender_role: "OWNER",
      text: "[seed-neg-2] I can accept reduced lock-in period.",
      created_at: now - 6 * DAY_MS + 95 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_2_COMBINED,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-2] Proposal v2 shared to both parties.",
      created_at: now - 6 * DAY_MS + 120 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_3_OPS_TENANT,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-3] Final terms aligned, please confirm token policy.",
      created_at: now - 5 * DAY_MS + 60 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_3_OPS_TENANT,
      sender_user_id: tenantForInquiry3,
      sender_role: "TENANT",
      text: "[seed-neg-3] Confirmed. I am ready to pay token today.",
      created_at: now - 5 * DAY_MS + 75 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_3_OPS_OWNER,
      sender_user_id: users.owner2._id,
      sender_role: "OWNER",
      text: "[seed-neg-3] Terms accepted from my side as well.",
      created_at: now - 5 * DAY_MS + 90 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_3_COMBINED,
      sender_user_id: users.founder_one._id,
      sender_role: "SYSTEM",
      text: "[seed-neg-3] Proposal v3 marked BOTH_AGREED.",
      created_at: now - 5 * DAY_MS + 110 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_3_COMBINED,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-3] Token collection recorded for INR 25,000.",
      created_at: now - 5 * DAY_MS + 130 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_4_OPS_TENANT,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-4] Police verification and handover checklist completed.",
      created_at: now - 4 * DAY_MS + 60 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_4_OPS_OWNER,
      sender_user_id: users.owner1._id,
      sender_role: "OWNER",
      text: "[seed-neg-4] Rent agreement signed and uploaded.",
      created_at: now - 4 * DAY_MS + 75 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_4_COMBINED,
      sender_user_id: users.founder_one._id,
      sender_role: "SYSTEM",
      text: "[seed-neg-4] Deal checklist fully approved by both parties.",
      created_at: now - 4 * DAY_MS + 95 * 60 * 1000,
    },
    {
      channel_id: channelMap.NEG_4_COMBINED,
      sender_user_id: users.ops1._id,
      sender_role: "OPS",
      text: "[seed-neg-4] Negotiation is ready for closure handoff.",
      created_at: now - 4 * DAY_MS + 120 * 60 * 1000,
    },
  ];

  let insertedMessages = 0;
  for (const messageSeed of messageSeeds) {
    const result = await ensureChatMessage(ctx, messageSeed);
    if (result.inserted) {
      insertedMessages += 1;
    }
  }

  const allRooms: NegotiationRoomType[] = ["OPS_TENANT", "OPS_OWNER", "COMBINED"];

  const neg2ProposalV1 = await upsertProposal(ctx, {
    negotiation_id: neg2Id,
    version: 1,
    status: "SUPERSEDED",
    monthly_rent_paise: 3600000,
    security_deposit_paise: 10800000,
    security_deposit_months: 3,
    lock_in_period_months: 12,
    notice_period_months: 2,
    move_in_date: now + 28 * DAY_MS,
    maintenance_charges_paise: 300000,
    maintenance_paid_by: "TENANT",
    rent_escalation_type: "PERCENTAGE",
    rent_escalation_value: 5,
    furnishing_terms: "Semi-furnished with modular kitchen.",
    brokerage_tenant_side_paise: 180000,
    brokerage_owner_side_paise: 180000,
    token_advance_amount_paise: 2000000,
    special_conditions: "Painting to be completed before possession.",
    created_by_admin_id: users.founder_one._id,
    created_at: now - 40 * 60 * 60 * 1000,
    shared_to_rooms: allRooms,
    shared_at: now - 39 * 60 * 60 * 1000,
    is_locked: false,
    locked_at: undefined,
    is_deleted: false,
  });

  const neg2ProposalV2 = await upsertProposal(ctx, {
    negotiation_id: neg2Id,
    version: 2,
    status: "SHARED",
    monthly_rent_paise: 3500000,
    security_deposit_paise: 7000000,
    security_deposit_months: 2,
    lock_in_period_months: 8,
    notice_period_months: 2,
    move_in_date: now + 24 * DAY_MS,
    maintenance_charges_paise: 280000,
    maintenance_paid_by: "TENANT",
    rent_escalation_type: "PERCENTAGE",
    rent_escalation_value: 4,
    furnishing_terms: "Semi-furnished with AC in master bedroom.",
    brokerage_tenant_side_paise: 175000,
    brokerage_owner_side_paise: 175000,
    token_advance_amount_paise: 2200000,
    special_conditions: "Society move-in charges to be paid by tenant.",
    created_by_admin_id: users.founder_one._id,
    created_at: now - 32 * 60 * 60 * 1000,
    shared_to_rooms: allRooms,
    shared_at: now - 31 * 60 * 60 * 1000,
    is_locked: false,
    locked_at: undefined,
    is_deleted: false,
  });

  await ctx.db.patch(neg2Id, {
    status: "TERMS_PROPOSED",
    active_proposal_id: neg2ProposalV2.id,
    last_activity_at: now - 26 * 60 * 60 * 1000,
    terms_agreed_at: undefined,
  });

  const neg3ProposalV1 = await upsertProposal(ctx, {
    negotiation_id: neg3Id,
    version: 1,
    status: "SUPERSEDED",
    monthly_rent_paise: 1900000,
    security_deposit_paise: 5700000,
    security_deposit_months: 3,
    lock_in_period_months: 12,
    notice_period_months: 2,
    move_in_date: now + 20 * DAY_MS,
    maintenance_charges_paise: 200000,
    maintenance_paid_by: "TENANT",
    rent_escalation_type: "PERCENTAGE",
    rent_escalation_value: 5,
    furnishing_terms: "Fully furnished except washing machine.",
    brokerage_tenant_side_paise: 95000,
    brokerage_owner_side_paise: 95000,
    token_advance_amount_paise: 2500000,
    special_conditions: "Minor plumbing fixes before possession.",
    created_by_admin_id: users.founder_one._id,
    created_at: now - 70 * 60 * 60 * 1000,
    shared_to_rooms: allRooms,
    shared_at: now - 69 * 60 * 60 * 1000,
    is_locked: false,
    locked_at: undefined,
    is_deleted: false,
  });

  const neg3ProposalV2 = await upsertProposal(ctx, {
    negotiation_id: neg3Id,
    version: 2,
    status: "SUPERSEDED",
    monthly_rent_paise: 1850000,
    security_deposit_paise: 5550000,
    security_deposit_months: 3,
    lock_in_period_months: 9,
    notice_period_months: 2,
    move_in_date: now + 18 * DAY_MS,
    maintenance_charges_paise: 180000,
    maintenance_paid_by: "SPLIT",
    rent_escalation_type: "PERCENTAGE",
    rent_escalation_value: 4,
    furnishing_terms: "Fully furnished with modular storage.",
    brokerage_tenant_side_paise: 90000,
    brokerage_owner_side_paise: 90000,
    token_advance_amount_paise: 2500000,
    special_conditions: "Lock-in reduced after owner approval.",
    created_by_admin_id: users.founder_one._id,
    created_at: now - 55 * 60 * 60 * 1000,
    shared_to_rooms: allRooms,
    shared_at: now - 54 * 60 * 60 * 1000,
    is_locked: false,
    locked_at: undefined,
    is_deleted: false,
  });

  const neg3ProposalV3 = await upsertProposal(ctx, {
    negotiation_id: neg3Id,
    version: 3,
    status: "BOTH_AGREED",
    monthly_rent_paise: 1800000,
    security_deposit_paise: 5400000,
    security_deposit_months: 3,
    lock_in_period_months: 6,
    notice_period_months: 2,
    move_in_date: now + 15 * DAY_MS,
    maintenance_charges_paise: 150000,
    maintenance_paid_by: "SPLIT",
    rent_escalation_type: "PERCENTAGE",
    rent_escalation_value: 3,
    furnishing_terms: "Fully furnished, deep-clean before move-in.",
    brokerage_tenant_side_paise: 90000,
    brokerage_owner_side_paise: 90000,
    token_advance_amount_paise: 2500000,
    special_conditions: "Painting and pest control by owner.",
    created_by_admin_id: users.founder_one._id,
    created_at: now - 36 * 60 * 60 * 1000,
    shared_to_rooms: allRooms,
    shared_at: now - 35 * 60 * 60 * 1000,
    is_locked: true,
    locked_at: now - 34 * 60 * 60 * 1000,
    is_deleted: false,
  });

  const neg4ProposalV1 = await upsertProposal(ctx, {
    negotiation_id: neg4Id,
    version: 1,
    status: "BOTH_AGREED",
    monthly_rent_paise: 4200000,
    security_deposit_paise: 8400000,
    security_deposit_months: 2,
    lock_in_period_months: 11,
    notice_period_months: 2,
    move_in_date: now + 10 * DAY_MS,
    maintenance_charges_paise: 350000,
    maintenance_paid_by: "TENANT",
    rent_escalation_type: "PERCENTAGE",
    rent_escalation_value: 5,
    furnishing_terms: "Semi-furnished with wardrobes and ACs.",
    brokerage_tenant_side_paise: 210000,
    brokerage_owner_side_paise: 210000,
    token_advance_amount_paise: 2800000,
    special_conditions: "Ready for closure and key handover this week.",
    created_by_admin_id: users.founder_one._id,
    created_at: now - 65 * 60 * 60 * 1000,
    shared_to_rooms: allRooms,
    shared_at: now - 64 * 60 * 60 * 1000,
    is_locked: true,
    locked_at: now - 63 * 60 * 60 * 1000,
    is_deleted: false,
  });

  let insertedSignatures = 0;
  const signatures = [
    await ensureProposalSignature(ctx, {
      proposal_id: neg3ProposalV3.id,
      negotiation_id: neg3Id,
      user_id: tenantForInquiry3,
      user_role: "TENANT",
      signed_at: now - 33 * 60 * 60 * 1000,
      agreement_text: "I agree to proposal v3 terms.",
      proposal_version: 3,
    }),
    await ensureProposalSignature(ctx, {
      proposal_id: neg3ProposalV3.id,
      negotiation_id: neg3Id,
      user_id: users.owner2._id,
      user_role: "OWNER",
      signed_at: now - 32 * 60 * 60 * 1000,
      agreement_text: "Owner approval for proposal v3.",
      proposal_version: 3,
    }),
    await ensureProposalSignature(ctx, {
      proposal_id: neg4ProposalV1.id,
      negotiation_id: neg4Id,
      user_id: tenantForInquiry4,
      user_role: "TENANT",
      signed_at: now - 62 * 60 * 60 * 1000,
      agreement_text: "I agree to final closure-ready terms.",
      proposal_version: 1,
    }),
    await ensureProposalSignature(ctx, {
      proposal_id: neg4ProposalV1.id,
      negotiation_id: neg4Id,
      user_id: users.owner1._id,
      user_role: "OWNER",
      signed_at: now - 61 * 60 * 60 * 1000,
      agreement_text: "Owner approval for closure-ready proposal.",
      proposal_version: 1,
    }),
  ];

  for (const signature of signatures) {
    if (signature.inserted) {
      insertedSignatures += 1;
    }
  }

  const tokenRecordNeg3 = await ensureTokenRecord(ctx, {
    negotiation_id: neg3Id,
    amount_paise: 2500000,
    collected_at: now - 30 * 60 * 60 * 1000,
    collection_method: "UPI",
    refund_policy: "REFUNDABLE_WITHIN_DAYS",
    refund_days: 7,
    refund_percentage: undefined,
    tenant_agreed_at: now - 31 * 60 * 60 * 1000,
    collected_by_admin_id: users.founder_one._id,
    notes: "Token collected after both parties agreed to v3.",
  });

  const tokenRecordNeg4 = await ensureTokenRecord(ctx, {
    negotiation_id: neg4Id,
    amount_paise: 2800000,
    collected_at: now - 58 * 60 * 60 * 1000,
    collection_method: "BANK_TRANSFER",
    refund_policy: "NON_REFUNDABLE",
    refund_days: undefined,
    refund_percentage: undefined,
    tenant_agreed_at: now - 59 * 60 * 60 * 1000,
    collected_by_admin_id: users.founder_one._id,
    notes: "Token collected and closure documents initiated.",
  });

  await ctx.db.patch(neg2Id, {
    active_proposal_id: neg2ProposalV2.id,
    status: "TERMS_PROPOSED",
    terms_agreed_at: undefined,
    last_activity_at: now - 26 * 60 * 60 * 1000,
  });

  await ctx.db.patch(neg3Id, {
    active_proposal_id: neg3ProposalV3.id,
    status: "TOKEN_COLLECTED",
    terms_agreed_at: now - 33 * 60 * 60 * 1000,
    last_activity_at: now - 12 * 60 * 60 * 1000,
  });

  await ctx.db.patch(neg4Id, {
    active_proposal_id: neg4ProposalV1.id,
    status: "READY_FOR_CLOSURE",
    terms_agreed_at: now - 62 * 60 * 60 * 1000,
    ready_for_closure_at: now - 3 * 60 * 60 * 1000,
    last_activity_at: now - 90 * 60 * 1000,
  });

  const insertedProposalCount = [
    neg2ProposalV1,
    neg2ProposalV2,
    neg3ProposalV1,
    neg3ProposalV2,
    neg3ProposalV3,
    neg4ProposalV1,
  ].filter((proposal) => proposal.inserted).length;

  const scenarios = {
    neg1: {
      key: "NEG_1" as const,
      inquiry: inquiry1,
      listing: listing1,
      tenant_user_id: tenantForInquiry1,
      owner_user_id: users.owner2._id,
      negotiation_id: neg1Id,
      channels: {
        ops_tenant: channelMap.NEG_1_OPS_TENANT,
        ops_owner: channelMap.NEG_1_OPS_OWNER,
        combined: channelMap.NEG_1_COMBINED,
      },
    },
    neg2: {
      key: "NEG_2" as const,
      inquiry: inquiry2,
      listing: listing2,
      tenant_user_id: tenantForInquiry2,
      owner_user_id: users.owner1._id,
      negotiation_id: neg2Id,
      channels: {
        ops_tenant: channelMap.NEG_2_OPS_TENANT,
        ops_owner: channelMap.NEG_2_OPS_OWNER,
        combined: channelMap.NEG_2_COMBINED,
      },
    },
    neg3: {
      key: "NEG_3" as const,
      inquiry: inquiry3,
      listing: listing3,
      tenant_user_id: tenantForInquiry3,
      owner_user_id: users.owner2._id,
      negotiation_id: neg3Id,
      channels: {
        ops_tenant: channelMap.NEG_3_OPS_TENANT,
        ops_owner: channelMap.NEG_3_OPS_OWNER,
        combined: channelMap.NEG_3_COMBINED,
      },
    },
    neg4: {
      key: "NEG_4" as const,
      inquiry: inquiry4,
      listing: listing4,
      tenant_user_id: tenantForInquiry4,
      owner_user_id: users.owner1._id,
      negotiation_id: neg4Id,
      channels: {
        ops_tenant: channelMap.NEG_4_OPS_TENANT,
        ops_owner: channelMap.NEG_4_OPS_OWNER,
        combined: channelMap.NEG_4_COMBINED,
      },
    },
  };

  return {
    users,
    scenarios,
    stats: {
      negotiations: 4,
      channels: 12,
      messagesInserted: insertedMessages,
      proposals: insertedProposalCount,
      signatures: insertedSignatures,
      tokenRecords: Number(tokenRecordNeg3.inserted) + Number(tokenRecordNeg4.inserted),
    },
  };
}

export const seedDemoNegotiations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await ensureNegotiationScenarios(ctx);

    return {
      seeded: true,
      negotiations: result.stats.negotiations,
      channels: result.stats.channels,
      messages_inserted: result.stats.messagesInserted,
      proposals_inserted: result.stats.proposals,
      signatures_inserted: result.stats.signatures,
      token_records_inserted: result.stats.tokenRecords,
      negotiation_ids: {
        active: result.scenarios.neg1.negotiation_id,
        terms_proposed: result.scenarios.neg2.negotiation_id,
        token_collected: result.scenarios.neg3.negotiation_id,
        ready_for_closure: result.scenarios.neg4.negotiation_id,
      },
    };
  },
});

export const seedDemoDealRoom = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const result = await ensureNegotiationScenarios(ctx);
    const { users, scenarios } = result;

    const pendingInvite = await ensureInvitePending(ctx, {
      inquiry_id: scenarios.neg1.inquiry._id,
      channel_id: scenarios.neg1.channels.ops_owner,
      owner_expected_email: DEMO_EMAILS.owner2,
      created_by_admin_id: users.founder_one._id,
      created_at: now,
      expires_at: now + 7 * DAY_MS,
    });

    const consumedInvite = await ensureInviteConsumed(ctx, {
      inquiry_id: scenarios.neg2.inquiry._id,
      channel_id: scenarios.neg2.channels.ops_owner,
      owner_expected_email: DEMO_EMAILS.owner1,
      consumed_by_user_id: users.owner1._id,
      created_by_admin_id: users.founder_one._id,
      created_at: now - 2 * DAY_MS,
      consumed_at: now - DAY_MS,
      expires_at: now + 5 * DAY_MS,
    });

    const sharedChecklistItems: Doc<"deal_checklists">["items"] = [
      {
        item_id: "seed-neg3-rent",
        term_type: "RENT_AMOUNT",
        source: "ADMIN_ADDED",
        description: "Monthly rent fixed at INR 18,000",
        extracted_value: "18000",
        admin_edited_value: "18000",
        tenant_approval: {
          status: "AGREED",
          responded_at: now - 10 * 60 * 60 * 1000,
          comment: "Accepted",
        },
        owner_approval: {
          status: "AGREED",
          responded_at: now - 9 * 60 * 60 * 1000,
          comment: "Confirmed",
        },
        overall_status: "RESOLVED",
      },
      {
        item_id: "seed-neg3-deposit",
        term_type: "DEPOSIT",
        source: "ADMIN_ADDED",
        description: "Security deposit at 3 months rent",
        extracted_value: "54000",
        admin_edited_value: "54000",
        tenant_approval: {
          status: "AGREED",
          responded_at: now - 8 * 60 * 60 * 1000,
          comment: "Okay",
        },
        owner_approval: {
          status: "PENDING",
          responded_at: undefined,
          comment: undefined,
        },
        overall_status: "UNREVIEWED",
      },
      {
        item_id: "seed-neg3-movein",
        term_type: "MOVE_IN_DATE",
        source: "AI_EXTRACTED",
        description: "Move-in date targeted for next fortnight",
        extracted_value: new Date(now + 15 * DAY_MS).toISOString().slice(0, 10),
        admin_edited_value: undefined,
        tenant_approval: {
          status: "PENDING",
          responded_at: undefined,
          comment: undefined,
        },
        owner_approval: {
          status: "PENDING",
          responded_at: undefined,
          comment: undefined,
        },
        overall_status: "UNREVIEWED",
      },
      {
        item_id: "seed-neg3-maintenance",
        term_type: "MAINTENANCE",
        source: "ADMIN_ADDED",
        description: "Maintenance split equally between both parties",
        extracted_value: "Split",
        admin_edited_value: "Split 50:50",
        tenant_approval: {
          status: "AGREED",
          responded_at: now - 7 * 60 * 60 * 1000,
          comment: "Fair",
        },
        owner_approval: {
          status: "AGREED",
          responded_at: now - 7 * 60 * 60 * 1000,
          comment: "Accepted",
        },
        overall_status: "RESOLVED",
      },
      {
        item_id: "seed-neg3-brokerage",
        term_type: "BROKERAGE",
        source: "ADMIN_ADDED",
        description: "Brokerage payable equally by tenant and owner",
        extracted_value: "90000 each",
        admin_edited_value: undefined,
        tenant_approval: {
          status: "PENDING",
          responded_at: undefined,
          comment: undefined,
        },
        owner_approval: {
          status: "PENDING",
          responded_at: undefined,
          comment: undefined,
        },
        overall_status: "UNREVIEWED",
      },
    ];

    const sharedChecklist = await ensureChecklistWithSeedPrefix(ctx, {
      inquiry_id: scenarios.neg3.inquiry._id,
      channel_id: scenarios.neg3.channels.combined,
      seed_prefix: "seed-neg3-",
      status: "SHARED",
      items: sharedChecklistItems,
      created_by_admin_id: users.founder_one._id,
      created_at: now - 2 * DAY_MS,
      shared_at: now - 2 * DAY_MS + 30 * 60 * 1000,
      approved_at: undefined,
    });

    const approvedChecklistItems: Doc<"deal_checklists">["items"] = [
      {
        item_id: "seed-neg4-rent",
        term_type: "RENT_AMOUNT",
        source: "ADMIN_ADDED",
        description: "Monthly rent fixed at INR 42,000",
        extracted_value: "42000",
        admin_edited_value: "42000",
        tenant_approval: {
          status: "AGREED",
          responded_at: now - 40 * 60 * 60 * 1000,
          comment: "Confirmed",
        },
        owner_approval: {
          status: "AGREED",
          responded_at: now - 39 * 60 * 60 * 1000,
          comment: "Confirmed",
        },
        overall_status: "RESOLVED",
      },
      {
        item_id: "seed-neg4-deposit",
        term_type: "DEPOSIT",
        source: "ADMIN_ADDED",
        description: "Security deposit fixed at INR 84,000",
        extracted_value: "84000",
        admin_edited_value: "84000",
        tenant_approval: {
          status: "AGREED",
          responded_at: now - 38 * 60 * 60 * 1000,
          comment: "Confirmed",
        },
        owner_approval: {
          status: "AGREED",
          responded_at: now - 38 * 60 * 60 * 1000,
          comment: "Confirmed",
        },
        overall_status: "RESOLVED",
      },
      {
        item_id: "seed-neg4-lockin",
        term_type: "LOCK_IN_PERIOD",
        source: "ADMIN_ADDED",
        description: "Lock-in period set to 11 months",
        extracted_value: "11 months",
        admin_edited_value: "11 months",
        tenant_approval: {
          status: "AGREED",
          responded_at: now - 37 * 60 * 60 * 1000,
          comment: "Fine",
        },
        owner_approval: {
          status: "AGREED",
          responded_at: now - 37 * 60 * 60 * 1000,
          comment: "Fine",
        },
        overall_status: "RESOLVED",
      },
      {
        item_id: "seed-neg4-maintenance",
        term_type: "MAINTENANCE",
        source: "ADMIN_ADDED",
        description: "Maintenance payable by tenant",
        extracted_value: "Tenant",
        admin_edited_value: "Tenant",
        tenant_approval: {
          status: "AGREED",
          responded_at: now - 36 * 60 * 60 * 1000,
          comment: "Accepted",
        },
        owner_approval: {
          status: "AGREED",
          responded_at: now - 36 * 60 * 60 * 1000,
          comment: "Accepted",
        },
        overall_status: "RESOLVED",
      },
      {
        item_id: "seed-neg4-brokerage",
        term_type: "BROKERAGE",
        source: "ADMIN_ADDED",
        description: "Brokerage INR 2,10,000 each side",
        extracted_value: "210000 each",
        admin_edited_value: "210000 each",
        tenant_approval: {
          status: "AGREED",
          responded_at: now - 35 * 60 * 60 * 1000,
          comment: "Confirmed",
        },
        owner_approval: {
          status: "AGREED",
          responded_at: now - 35 * 60 * 60 * 1000,
          comment: "Confirmed",
        },
        overall_status: "RESOLVED",
      },
    ];

    const approvedChecklist = await ensureChecklistWithSeedPrefix(ctx, {
      inquiry_id: scenarios.neg4.inquiry._id,
      channel_id: scenarios.neg4.channels.combined,
      seed_prefix: "seed-neg4-",
      status: "APPROVED",
      items: approvedChecklistItems,
      created_by_admin_id: users.founder_one._id,
      created_at: now - 3 * DAY_MS,
      shared_at: now - 2 * DAY_MS,
      approved_at: now - 20 * 60 * 60 * 1000,
    });

    const checklistSignature1 = await ensureChecklistSignature(ctx, {
      checklist_id: approvedChecklist.id,
      signer_user_id: scenarios.neg4.tenant_user_id,
      signer_role: "TENANT",
      signature_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      signed_at: now - 19 * 60 * 60 * 1000,
      ip_address: "127.0.0.1",
    });

    if (!scenarios.neg4.owner_user_id) {
      throw new Error("seedDemoDealRoom: NEG_4 owner linkage missing");
    }

    const checklistSignature2 = await ensureChecklistSignature(ctx, {
      checklist_id: approvedChecklist.id,
      signer_user_id: scenarios.neg4.owner_user_id,
      signer_role: "OWNER",
      signature_hash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      signed_at: now - 18 * 60 * 60 * 1000,
      ip_address: "127.0.0.1",
    });

    return {
      seeded: true,
      deal_checklists: {
        shared_checklist_id: sharedChecklist.id,
        approved_checklist_id: approvedChecklist.id,
      },
      owner_invites: {
        pending_invite_id: pendingInvite.id,
        consumed_invite_id: consumedInvite.id,
      },
      inserted_counts: {
        shared_checklist: Number(sharedChecklist.inserted),
        approved_checklist: Number(approvedChecklist.inserted),
        pending_invite: Number(pendingInvite.inserted),
        consumed_invite: Number(consumedInvite.inserted),
        checklist_signatures:
          Number(checklistSignature1.inserted) + Number(checklistSignature2.inserted),
      },
    };
  },
});

type EdgeScenarioKey = "stale" | "rounds" | "token" | "failed";

type EdgeScenarioContext = {
  users: SeedUsers;
  societyId: Id<"societies">;
  buildingId: Id<"buildings">;
  guardUserId: Id<"users">;
};

type EdgeScenarioSeedInput = {
  key: EdgeScenarioKey;
  flatNumber: string;
  listingSlug: string;
  ownerName: string;
  ownerPhone: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  tenantUserId: Id<"users">;
  rentPaise: number;
};

const EDGE_SCENARIO_SEEDS: Record<EdgeScenarioKey, Omit<EdgeScenarioSeedInput, "tenantUserId">> = {
  stale: {
    key: "stale",
    flatNumber: "N-601",
    listingSlug: "seed-neg-stale-n-601",
    ownerName: "Nitin Arora",
    ownerPhone: "7600000601",
    tenantName: "Rohan T",
    tenantPhone: "9400000601",
    tenantEmail: "rohan.stale@test.demorentals.com",
    rentPaise: 2900000,
  },
  rounds: {
    key: "rounds",
    flatNumber: "N-602",
    listingSlug: "seed-neg-rounds-n-602",
    ownerName: "Neha Bhatia",
    ownerPhone: "7600000602",
    tenantName: "Maya G",
    tenantPhone: "9400000602",
    tenantEmail: "maya.rounds@test.demorentals.com",
    rentPaise: 3050000,
  },
  token: {
    key: "token",
    flatNumber: "N-603",
    listingSlug: "seed-neg-token-n-603",
    ownerName: "Nakul Jain",
    ownerPhone: "7600000603",
    tenantName: "Isha V",
    tenantPhone: "9400000603",
    tenantEmail: "isha.token@test.demorentals.com",
    rentPaise: 2650000,
  },
  failed: {
    key: "failed",
    flatNumber: "N-604",
    listingSlug: "seed-neg-failed-n-604",
    ownerName: "Nandini Rao",
    ownerPhone: "7600000604",
    tenantName: "Akash D",
    tenantPhone: "9400000604",
    tenantEmail: "akash.failed@test.demorentals.com",
    rentPaise: 2750000,
  },
};

async function loadEdgeScenarioContext(ctx: MutationCtx): Promise<EdgeScenarioContext> {
  const users = await loadSeedUsers(ctx);
  const [society, guardUser] = await Promise.all([
    lookupSocietyDoc(ctx, "Sunshine Heights"),
    getUserByPhone(ctx, SHARED_DEMO_PHONES.guard1, "GUARD"),
  ]);

  if (!guardUser) {
    throw new Error("seedDemoNegotiations: Missing guard user for edge-case negotiation seeds");
  }

  const buildingId = await lookupBuildingInSociety(ctx, society._id, "Wing A");

  return {
    users,
    societyId: society._id,
    buildingId,
    guardUserId: guardUser._id,
  };
}

async function ensureEdgeScenarioBase(
  ctx: MutationCtx,
  context: EdgeScenarioContext,
  seedInput: EdgeScenarioSeedInput,
): Promise<{
  lead: Doc<"leads">;
  listing: Doc<"listings">;
  inquiry: Doc<"tenant_inquiries">;
  tenantUserId: Id<"users">;
}> {
  const floorNumber = seedInput.flatNumber.split("-")[1]?.[0] ?? "6";

  const lead = await ensureSeedRecord(ctx, {
    label: `edge-neg-lead-${seedInput.key}`,
    lookup: async () =>
      await ctx.db
        .query("leads")
        .withIndex("by_society_building_flat", (q) =>
          q
            .eq("society_id", context.societyId)
            .eq("building_id", context.buildingId)
            .eq("flat_number", seedInput.flatNumber),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("leads", {
        society_id: context.societyId,
        building_id: context.buildingId,
        floor_number: floorNumber,
        flat_number: seedInput.flatNumber,
        owner_name: seedInput.ownerName,
        owner_phone: seedInput.ownerPhone,
        owner_id: undefined,
        availability_type: "VACANT_NOW",
        availability_date: undefined,
        rent_expected: seedInput.rentPaise,
        furnishing: "SEMI_FURNISHED",
        notes: `Edge scenario ${seedInput.key} lead`,
        owner_consent_to_call: true,
        submitted_by_guard_id: context.guardUserId,
        status: "VERIFIED",
        notes_thread: undefined,
        quality_flags: undefined,
        duplicate_of_lead_id: undefined,
        prospective_bounty: 25000,
        searchable_text: `${seedInput.ownerName} ${seedInput.ownerPhone} ${seedInput.flatNumber}`,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        floor_number: floorNumber,
        owner_name: seedInput.ownerName,
        owner_phone: seedInput.ownerPhone,
        availability_type: "VACANT_NOW",
        rent_expected: seedInput.rentPaise,
        furnishing: "SEMI_FURNISHED",
        notes: `Edge scenario ${seedInput.key} lead`,
        owner_consent_to_call: true,
        submitted_by_guard_id: context.guardUserId,
        status: "VERIFIED",
        notes_thread: undefined,
        quality_flags: undefined,
        duplicate_of_lead_id: undefined,
        prospective_bounty: 25000,
        searchable_text: `${seedInput.ownerName} ${seedInput.ownerPhone} ${seedInput.flatNumber}`,
      });
    },
  });

  const listing = await ensureSeedRecord(ctx, {
    label: `edge-neg-listing-${seedInput.key}`,
    lookup: async () =>
      await ctx.db
        .query("listings")
        .withIndex("by_slug", (q) => q.eq("slug", seedInput.listingSlug))
        .first(),
    create: async () =>
      await ctx.db.insert("listings", {
        lead_id: lead.doc._id,
        owner_id: undefined,
        slug: seedInput.listingSlug,
        status: "PUBLISHED",
        rent_monthly: seedInput.rentPaise,
        deposit: seedInput.rentPaise * 2,
        maintenance: 250000,
        bhk_config: "2BHK",
        furnishing: "SEMI_FURNISHED",
        floor_number: floorNumber,
        carpet_area_sqft: 860,
        available_from: Date.now() + 10 * DAY_MS,
        description: `Edge scenario ${seedInput.key} listing`,
        house_rules: ["No loud music after 10 PM", "Society rules apply"],
        parking: "COVERED",
        pet_friendly: false,
        amenities: ["lift", "security", "cctv"],
        created_by_admin_id: context.users.founder_one._id,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        lead_id: lead.doc._id,
        status: "PUBLISHED",
        rent_monthly: seedInput.rentPaise,
        deposit: seedInput.rentPaise * 2,
        maintenance: 250000,
        bhk_config: "2BHK",
        furnishing: "SEMI_FURNISHED",
        floor_number: floorNumber,
        carpet_area_sqft: 860,
        available_from: Date.now() + 10 * DAY_MS,
        description: `Edge scenario ${seedInput.key} listing`,
        house_rules: ["No loud music after 10 PM", "Society rules apply"],
        parking: "COVERED",
        pet_friendly: false,
        amenities: ["lift", "security", "cctv"],
        created_by_admin_id: context.users.founder_one._id,
      });
    },
  });

  const inquiry = await ensureSeedRecord(ctx, {
    label: `edge-neg-inquiry-${seedInput.key}`,
    lookup: async () =>
      await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", listing.doc._id))
        .filter((q) => q.eq(q.field("tenant_phone"), seedInput.tenantPhone))
        .first(),
    create: async () =>
      await ctx.db.insert("tenant_inquiries", {
        listing_id: listing.doc._id,
        tenant_id: seedInput.tenantUserId,
        tenant_name: seedInput.tenantName,
        tenant_phone: seedInput.tenantPhone,
        tenant_email: seedInput.tenantEmail,
        preferred_visit_date: Date.now() + 2 * DAY_MS,
        preferred_visit_slot: "Evening",
        message: `Edge scenario ${seedInput.key} inquiry`,
        status: "NEGOTIATION_INITIATED",
        bounty_amount: undefined,
        bounty_posted_at: undefined,
        bounty_expires_at: undefined,
        assigned_guard_id: undefined,
        visit_id: undefined,
        ops_notes: `Edge scenario ${seedInput.key}`,
        rejection_reason: undefined,
        reviewed_by_admin_id: context.users.founder_one._id,
        updated_at: Date.now(),
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        tenant_id: seedInput.tenantUserId,
        tenant_name: seedInput.tenantName,
        tenant_phone: seedInput.tenantPhone,
        tenant_email: seedInput.tenantEmail,
        preferred_visit_date: Date.now() + 2 * DAY_MS,
        preferred_visit_slot: "Evening",
        message: `Edge scenario ${seedInput.key} inquiry`,
        status: "NEGOTIATION_INITIATED",
        bounty_amount: undefined,
        bounty_posted_at: undefined,
        bounty_expires_at: undefined,
        assigned_guard_id: undefined,
        visit_id: undefined,
        ops_notes: `Edge scenario ${seedInput.key}`,
        rejection_reason: undefined,
        reviewed_by_admin_id: context.users.founder_one._id,
        updated_at: Date.now(),
      });
    },
  });

  const tenantUserId = await ensureInquiryTenant(ctx, inquiry.doc, seedInput.tenantUserId);

  return {
    lead: lead.doc,
    listing: listing.doc,
    inquiry: inquiry.doc,
    tenantUserId,
  };
}

async function softDeleteUnexpectedProposals(
  ctx: MutationCtx,
  negotiationId: Id<"negotiations">,
  keepVersions: readonly number[],
): Promise<void> {
  const keepVersionSet = new Set(keepVersions);
  const proposals = await ctx.db
    .query("negotiation_terms_proposals")
    .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiationId))
    .collect();

  for (const proposal of proposals) {
    if (!keepVersionSet.has(proposal.version) && !proposal.is_deleted) {
      await ctx.db.patch(proposal._id, { is_deleted: true });
    }
  }
}

export const seedNegotiationStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const context = await loadEdgeScenarioContext(ctx);
    const seedInput: EdgeScenarioSeedInput = {
      ...EDGE_SCENARIO_SEEDS.stale,
      tenantUserId: context.users.tenant1._id,
    };

    const base = await ensureEdgeScenarioBase(ctx, context, seedInput);
    const initiatedAt = daysAgo(30);
    const lastActivityAt = daysAgo(15);

    const negotiationId = await upsertNegotiation(ctx, {
      inquiry_id: base.inquiry._id,
      listing_id: base.listing._id,
      tenant_user_id: base.tenantUserId,
      owner_user_id: context.users.owner1._id,
      initiated_by_admin_id: context.users.founder_one._id,
      status: "ACTIVE",
      initiated_at: initiatedAt,
      last_activity_at: lastActivityAt,
    });

    const staleProposal = await upsertProposal(ctx, {
      negotiation_id: negotiationId,
      version: 1,
      status: "SHARED",
      monthly_rent_paise: 2900000,
      security_deposit_paise: 5800000,
      security_deposit_months: 2,
      lock_in_period_months: 10,
      notice_period_months: 2,
      move_in_date: Date.now() + 14 * DAY_MS,
      maintenance_charges_paise: 250000,
      maintenance_paid_by: "TENANT",
      rent_escalation_type: "PERCENTAGE",
      rent_escalation_value: 5,
      furnishing_terms: "Semi-furnished with basic appliances.",
      brokerage_tenant_side_paise: 145000,
      brokerage_owner_side_paise: 145000,
      token_advance_amount_paise: 1500000,
      special_conditions: "Proposal shared but awaiting both party responses.",
      created_by_admin_id: context.users.founder_one._id,
      created_at: lastActivityAt,
      shared_to_rooms: undefined,
      shared_at: lastActivityAt,
      is_locked: false,
      locked_at: undefined,
      is_deleted: false,
    });

    await softDeleteUnexpectedProposals(ctx, negotiationId, [1]);

    await ctx.db.patch(negotiationId, {
      status: "ACTIVE",
      active_proposal_id: staleProposal.id,
      terms_agreed_at: undefined,
      failed_at: undefined,
      last_activity_at: lastActivityAt,
      stale_flagged: true,
      rounds_flagged: false,
      is_stale: true,
      too_many_rounds: false,
      token_without_agreement: false,
      escalation_flags_updated_at: lastActivityAt,
      flag_dismissed_at: undefined,
      flag_dismissed_reason: undefined,
      failure_reason: undefined,
      failure_notes: undefined,
    });

    return {
      seeded: true,
      negotiation_id: negotiationId,
      listing_id: base.listing._id,
      inquiry_id: base.inquiry._id,
      proposal_id: staleProposal.id,
      is_stale: true,
    };
  },
});

export const seedNegotiationTooManyRounds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const context = await loadEdgeScenarioContext(ctx);
    const seedInput: EdgeScenarioSeedInput = {
      ...EDGE_SCENARIO_SEEDS.rounds,
      tenantUserId: context.users.tenant2._id,
    };

    const base = await ensureEdgeScenarioBase(ctx, context, seedInput);
    const initiatedAt = daysAgo(40);
    const latestProposalAt = daysAgo(2);
    const roundDays = [40, 36, 32, 28, 24, 20, 16, 12, 8, 2] as const;

    const negotiationId = await upsertNegotiation(ctx, {
      inquiry_id: base.inquiry._id,
      listing_id: base.listing._id,
      tenant_user_id: base.tenantUserId,
      owner_user_id: context.users.owner2._id,
      initiated_by_admin_id: context.users.founder_one._id,
      status: "COUNTER_PROPOSED",
      initiated_at: initiatedAt,
      last_activity_at: latestProposalAt,
    });

    let insertedProposals = 0;
    let latestProposalId: Id<"negotiation_terms_proposals"> | undefined;

    for (let index = 0; index < roundDays.length; index += 1) {
      const version = index + 1;
      const monthlyRent = 3050000 + index * 40000;
      const proposalResult = await upsertProposal(ctx, {
        negotiation_id: negotiationId,
        version,
        status: version === roundDays.length ? "SHARED" : "SUPERSEDED",
        monthly_rent_paise: monthlyRent,
        security_deposit_paise: monthlyRent * 2,
        security_deposit_months: 2,
        lock_in_period_months: Math.max(6, 12 - Math.floor(index / 2)),
        notice_period_months: 2,
        move_in_date: Date.now() + (20 + index) * DAY_MS,
        maintenance_charges_paise: 250000 + index * 5000,
        maintenance_paid_by: index % 2 === 0 ? "TENANT" : "SPLIT",
        rent_escalation_type: "PERCENTAGE",
        rent_escalation_value: 5,
        furnishing_terms: `Round ${version} revision for back-and-forth negotiation`,
        brokerage_tenant_side_paise: 150000,
        brokerage_owner_side_paise: 150000,
        token_advance_amount_paise: 1800000 + index * 20000,
        special_conditions: `Round ${version}: waiting for counter response`,
        created_by_admin_id: context.users.founder_one._id,
        created_at: daysAgo(roundDays[index]),
        shared_to_rooms: undefined,
        shared_at: daysAgo(roundDays[index]),
        is_locked: false,
        locked_at: undefined,
        is_deleted: false,
      });

      if (proposalResult.inserted) {
        insertedProposals += 1;
      }
      latestProposalId = proposalResult.id;
    }

    await softDeleteUnexpectedProposals(ctx, negotiationId, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    await ctx.db.patch(negotiationId, {
      status: "COUNTER_PROPOSED",
      active_proposal_id: latestProposalId,
      terms_agreed_at: undefined,
      failed_at: undefined,
      last_activity_at: latestProposalAt,
      stale_flagged: false,
      rounds_flagged: true,
      is_stale: false,
      too_many_rounds: true,
      token_without_agreement: false,
      escalation_flags_updated_at: latestProposalAt,
      flag_dismissed_at: undefined,
      flag_dismissed_reason: undefined,
      failure_reason: undefined,
      failure_notes: undefined,
    });

    return {
      seeded: true,
      negotiation_id: negotiationId,
      listing_id: base.listing._id,
      inquiry_id: base.inquiry._id,
      proposal_rounds: 10,
      proposals_inserted: insertedProposals,
      too_many_rounds: true,
    };
  },
});

export const seedNegotiationTokenWithoutAgreement = internalMutation({
  args: {},
  handler: async (ctx) => {
    const context = await loadEdgeScenarioContext(ctx);
    const seedInput: EdgeScenarioSeedInput = {
      ...EDGE_SCENARIO_SEEDS.token,
      tenantUserId: context.users.tenant1._id,
    };

    const base = await ensureEdgeScenarioBase(ctx, context, seedInput);
    const initiatedAt = daysAgo(18);
    const tokenCollectedAt = daysAgo(7);
    const proposalSharedAt = daysAgo(9);

    const negotiationId = await upsertNegotiation(ctx, {
      inquiry_id: base.inquiry._id,
      listing_id: base.listing._id,
      tenant_user_id: base.tenantUserId,
      owner_user_id: context.users.owner1._id,
      initiated_by_admin_id: context.users.founder_one._id,
      status: "TOKEN_COLLECTED",
      initiated_at: initiatedAt,
      last_activity_at: tokenCollectedAt,
    });

    const draftProposal = await upsertProposal(ctx, {
      negotiation_id: negotiationId,
      version: 1,
      status: "SHARED",
      monthly_rent_paise: 2650000,
      security_deposit_paise: 5300000,
      security_deposit_months: 2,
      lock_in_period_months: 9,
      notice_period_months: 2,
      move_in_date: Date.now() + 12 * DAY_MS,
      maintenance_charges_paise: 230000,
      maintenance_paid_by: "TENANT",
      rent_escalation_type: "PERCENTAGE",
      rent_escalation_value: 4,
      furnishing_terms: "Semi-furnished with wardrobes and fans.",
      brokerage_tenant_side_paise: 132500,
      brokerage_owner_side_paise: 132500,
      token_advance_amount_paise: 1200000,
      special_conditions: "Token paid before formal sign-off.",
      created_by_admin_id: context.users.founder_one._id,
      created_at: proposalSharedAt,
      shared_to_rooms: undefined,
      shared_at: proposalSharedAt,
      is_locked: false,
      locked_at: undefined,
      is_deleted: false,
    });

    await softDeleteUnexpectedProposals(ctx, negotiationId, [1]);

    const tokenRecord = await ensureTokenRecord(ctx, {
      negotiation_id: negotiationId,
      amount_paise: 1200000,
      collected_at: tokenCollectedAt,
      collection_method: "UPI",
      refund_policy: "CASE_BY_CASE",
      refund_days: undefined,
      refund_percentage: undefined,
      tenant_agreed_at: daysAgo(8),
      collected_by_admin_id: context.users.founder_one._id,
      notes: "Token received via UPI, receipt ref: UTR-NEG-TOKEN-603",
    });

    const signatures = await ctx.db
      .query("negotiation_terms_signatures")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiationId))
      .collect();

    for (const signature of signatures) {
      if (!signature.is_deleted) {
        await ctx.db.patch(signature._id, { is_deleted: true });
      }
    }

    await ctx.db.patch(negotiationId, {
      status: "TOKEN_COLLECTED",
      active_proposal_id: draftProposal.id,
      terms_agreed_at: undefined,
      failed_at: undefined,
      last_activity_at: tokenCollectedAt,
      stale_flagged: false,
      rounds_flagged: false,
      is_stale: false,
      too_many_rounds: false,
      token_without_agreement: true,
      escalation_flags_updated_at: tokenCollectedAt,
      flag_dismissed_at: undefined,
      flag_dismissed_reason: undefined,
      failure_reason: undefined,
      failure_notes: undefined,
    });

    return {
      seeded: true,
      negotiation_id: negotiationId,
      listing_id: base.listing._id,
      inquiry_id: base.inquiry._id,
      proposal_id: draftProposal.id,
      token_record_id: tokenRecord.id,
      token_without_agreement: true,
    };
  },
});

export const seedNegotiationFailed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const context = await loadEdgeScenarioContext(ctx);
    const seedInput: EdgeScenarioSeedInput = {
      ...EDGE_SCENARIO_SEEDS.failed,
      tenantUserId: context.users.tenant2._id,
    };

    const base = await ensureEdgeScenarioBase(ctx, context, seedInput);
    const initiatedAt = daysAgo(20);
    const failedAt = daysAgo(3);

    const negotiationId = await upsertNegotiation(ctx, {
      inquiry_id: base.inquiry._id,
      listing_id: base.listing._id,
      tenant_user_id: base.tenantUserId,
      owner_user_id: context.users.owner2._id,
      initiated_by_admin_id: context.users.founder_one._id,
      status: "FAILED",
      initiated_at: initiatedAt,
      last_activity_at: failedAt,
    });

    const proposalV1 = await upsertProposal(ctx, {
      negotiation_id: negotiationId,
      version: 1,
      status: "SUPERSEDED",
      monthly_rent_paise: 2750000,
      security_deposit_paise: 5500000,
      security_deposit_months: 2,
      lock_in_period_months: 10,
      notice_period_months: 2,
      move_in_date: Date.now() + 16 * DAY_MS,
      maintenance_charges_paise: 240000,
      maintenance_paid_by: "TENANT",
      rent_escalation_type: "PERCENTAGE",
      rent_escalation_value: 5,
      furnishing_terms: "Semi-furnished, owner to complete touch-up painting.",
      brokerage_tenant_side_paise: 137500,
      brokerage_owner_side_paise: 137500,
      token_advance_amount_paise: 1500000,
      special_conditions: "Reasonable starting terms shared by OPS.",
      created_by_admin_id: context.users.founder_one._id,
      created_at: daysAgo(14),
      shared_to_rooms: undefined,
      shared_at: daysAgo(14),
      is_locked: false,
      locked_at: undefined,
      is_deleted: false,
    });

    const proposalV2 = await upsertProposal(ctx, {
      negotiation_id: negotiationId,
      version: 2,
      status: "SHARED",
      monthly_rent_paise: 2700000,
      security_deposit_paise: 5400000,
      security_deposit_months: 2,
      lock_in_period_months: 9,
      notice_period_months: 2,
      move_in_date: Date.now() + 14 * DAY_MS,
      maintenance_charges_paise: 230000,
      maintenance_paid_by: "TENANT",
      rent_escalation_type: "PERCENTAGE",
      rent_escalation_value: 4,
      furnishing_terms: "Revised terms after tenant request.",
      brokerage_tenant_side_paise: 135000,
      brokerage_owner_side_paise: 135000,
      token_advance_amount_paise: 1450000,
      special_conditions: "Tenant liked terms but later backed out.",
      created_by_admin_id: context.users.founder_one._id,
      created_at: daysAgo(6),
      shared_to_rooms: undefined,
      shared_at: daysAgo(6),
      is_locked: false,
      locked_at: undefined,
      is_deleted: false,
    });

    await softDeleteUnexpectedProposals(ctx, negotiationId, [1, 2]);

    await ctx.db.patch(negotiationId, {
      status: "FAILED",
      active_proposal_id: proposalV2.id,
      terms_agreed_at: undefined,
      ready_for_closure_at: undefined,
      failed_at: failedAt,
      failure_reason: "Tenant found alternative property",
      failure_notes: "Both proposals were reasonable, but tenant opted out.",
      last_activity_at: failedAt,
      stale_flagged: false,
      rounds_flagged: false,
      is_stale: false,
      too_many_rounds: false,
      token_without_agreement: false,
      escalation_flags_updated_at: failedAt,
      flag_dismissed_at: undefined,
      flag_dismissed_reason: undefined,
    });

    return {
      seeded: true,
      negotiation_id: negotiationId,
      listing_id: base.listing._id,
      inquiry_id: base.inquiry._id,
      proposal_ids: [proposalV1.id, proposalV2.id],
      failed_at: failedAt,
      failure_reason: "Tenant found alternative property",
    };
  },
});
