# Convex Schema Design

> This document translates the data models from `02-data-models.md` into actual Convex schema patterns, leveraging Convex-specific features: validators, indexes, search indexes, and components.

## Key Convex Packages

```bash
# Core
npm install convex

# Helper libraries (all production-ready)
npm install convex-helpers           # Triggers, custom functions, CRUD helpers
npm install @convex-dev/rate-limiter # Guard lead submission limits
npm install @convex-dev/aggregate    # Efficient counters for analytics
```

## Component Registration

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(rateLimiter);
app.use(aggregate, { name: "leadCounts" });
app.use(aggregate, { name: "visitCounts" });
app.use(aggregate, { name: "payoutTotals" });
export default app;
```

---

## Full Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const userTypeValidator = v.union(
  v.literal("GUARD"),
  v.literal("ADMIN"),
  v.literal("OPS"),
  v.literal("TENANT"),
  v.literal("OWNER"),
);
const userStatusValidator = v.union(
  v.literal("ACTIVE"),
  v.literal("INACTIVE"),
  v.literal("BANNED"),
);
const societyStatusValidator = v.union(
  v.literal("ONBOARDING"),
  v.literal("ACTIVE"),
  v.literal("INACTIVE"),
);
const buildingStatusValidator = v.union(v.literal("ACTIVE"), v.literal("INACTIVE"));
const guardTypeValidator = v.union(
  v.literal("BUILDING_SPECIFIC"),
  v.literal("MAIN_GATE"),
  v.literal("PARK"),
  v.literal("ROVING"),
  v.literal("SOCIETY_GUARD"),
);
const languagePreferenceValidator = v.union(
  v.literal("en"),
  v.literal("hi"),
  v.literal("hinglish"),
);
const shiftTypeValidator = v.union(v.literal("RECURRING"), v.literal("OVERRIDE"));
const locationTypeValidator = v.union(
  v.literal("BUILDING"),
  v.literal("MAIN_GATE"),
  v.literal("PARK"),
  v.literal("PARKING"),
  v.literal("OTHER"),
);
const availabilityTypeValidator = v.union(v.literal("VACANT_NOW"), v.literal("VACANT_FROM"));
const furnishingValidator = v.union(
  v.literal("UNFURNISHED"),
  v.literal("SEMI_FURNISHED"),
  v.literal("FULLY_FURNISHED"),
);
const leadStatusValidator = v.union(
  v.literal("SUBMITTED"),
  v.literal("NEED_INFO"),
  v.literal("POTENTIAL_DUPLICATE"),
  v.literal("VERIFIED"),
  v.literal("REJECTED"),
  v.literal("DUPLICATE"),
);
const leadQualityFlagValidator = v.union(
  v.literal("DUPLICATE_FLAT_MATCH"),
  v.literal("DUPLICATE_PHONE_MATCH"),
  v.literal("GUARD_HIGH_REJECTION"),
  v.literal("OFF_SHIFT_SUBMISSION"),
);
const ownerSourceValidator = v.union(
  v.literal("GUARD_LEAD"),
  v.literal("OWNER_SERVICE_REQUEST"),
  v.literal("OPS_CREATED"),
);
const ownerLifecycleStageValidator = v.union(
  v.literal("PROSPECT"),
  v.literal("VERIFIED"),
  v.literal("ACTIVE"),
  v.literal("MANAGED"),
  v.literal("DORMANT"),
  v.literal("CHURNED"),
);
const rmAssignmentStatusValidator = v.union(
  v.literal("ACTIVE"),
  v.literal("WARNING"),
  v.literal("ESCALATED"),
  v.literal("REASSIGNED"),
  v.literal("ENDED"),
);
const rmAssignedByValidator = v.union(v.literal("SYSTEM"), v.literal("ADMIN"));
const rmCheckInTypeValidator = v.union(
  v.literal("SCHEDULED"),
  v.literal("ISSUE"),
  v.literal("RE_LISTING"),
  v.literal("OWNER_INITIATED"),
  v.literal("AD_HOC"),
);
const rmCheckInMethodValidator = v.union(
  v.literal("CALL"),
  v.literal("WHATSAPP"),
  v.literal("IN_PERSON"),
  v.literal("OTHER"),
);
const rmCheckInOutcomeValidator = v.union(
  v.literal("RESOLVED"),
  v.literal("PENDING"),
  v.literal("ESCALATED"),
);
const callOutcomeValidator = v.union(
  v.literal("VERIFIED"),
  v.literal("UNREACHABLE"),
  v.literal("DECLINED"),
  v.literal("FALSE"),
);
const listingStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("PUBLISHED"),
  v.literal("ARCHIVED"),
);
const bhkConfigValidator = v.union(
  v.literal("1BHK"),
  v.literal("2BHK"),
  v.literal("3BHK"),
  v.literal("4BHK"),
  v.literal("STUDIO"),
  v.literal("OTHER"),
);
const parkingValidator = v.union(
  v.literal("NONE"),
  v.literal("COVERED"),
  v.literal("OPEN"),
  v.literal("BOTH"),
);
const amenityValidator = v.union(
  v.literal("gym"),
  v.literal("pool"),
  v.literal("garden"),
  v.literal("security"),
  v.literal("lift"),
  v.literal("power_backup"),
  v.literal("clubhouse"),
  v.literal("parking"),
  v.literal("play_area"),
  v.literal("jogging_track"),
  v.literal("intercom"),
  v.literal("cctv"),
  v.literal("fire_safety"),
  v.literal("water_supply_24x7"),
  v.literal("gas_pipeline"),
  v.literal("rain_water_harvesting"),
);
const listingInquirySourceValidator = v.union(
  v.literal("CONTACT_FORM"),
  v.literal("WHATSAPP_CLICK"),
);
const ownerServiceRequestStatusValidator = v.union(
  v.literal("SUBMITTED"),
  v.literal("CONTACTED"),
  v.literal("ONBOARDED"),
  v.literal("ACTIVE"),
  v.literal("REJECTED"),
  v.literal("DROPPED"),
);
const supportInquiryStatusValidator = v.union(
  v.literal("OPEN"),
  v.literal("IN_PROGRESS"),
  v.literal("RESOLVED"),
  v.literal("CLOSED"),
);
const supportInquiryPreferredContactMethodValidator = v.union(
  v.literal("EMAIL"),
  v.literal("PHONE"),
  v.literal("WHATSAPP"),
  v.literal("IN_APP"),
);
const supportInquiryPersonaTypeValidator = v.union(
  v.literal("TENANT"),
  v.literal("OWNER"),
  v.literal("GUARD"),
  v.literal("OTHER"),
);
const notificationChannelValidator = v.union(
  v.literal("IN_APP"),
  v.literal("PUSH"),
  v.literal("WHATSAPP"),
  v.literal("SMS"),
  v.literal("EMAIL"),
);
const notificationCategoryValidator = v.union(
  v.literal("LEAD_UPDATE"),
  v.literal("VISIT_UPDATE"),
  v.literal("PAYOUT_UPDATE"),
  v.literal("INQUIRY_UPDATE"),
  v.literal("AGREEMENT_STATUS"),
  v.literal("MOVE_IN_REMINDER"),
  v.literal("MAINTENANCE_UPDATE"),
  v.literal("SYSTEM_ALERT"),
);
const notificationSeverityValidator = v.union(
  v.literal("NORMAL"),
  v.literal("IMPORTANT"),
  v.literal("URGENT"),
);
const notificationEventStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("PROCESSING"),
  v.literal("DELIVERED"),
  v.literal("FAILED"),
  v.literal("DEAD_LETTER"),
  v.literal("SUPPRESSED"),
);
const notificationChannelDeliveryStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("SCHEDULED"),
  v.literal("DELIVERED"),
  v.literal("FAILED"),
  v.literal("SUPPRESSED"),
);
const tenantInquiryStatusValidator = v.union(
  v.literal("SUBMITTED"),
  v.literal("REVIEWED"),
  v.literal("BOUNTY_POSTED"),
  v.literal("GUARD_ACCEPTED"),
  v.literal("VISIT_SCHEDULED"),
  v.literal("VISIT_COMPLETED"),
  v.literal("NEGOTIATION_INITIATED"),
  v.literal("CLOSED"),
  v.literal("REJECTED"),
  v.literal("EXPIRED"),
);
const negotiationStatusValidator = v.union(
  v.literal("INITIATED"),
  v.literal("ACTIVE"),
  v.literal("TERMS_PROPOSED"),
  v.literal("COUNTER_PROPOSED"),
  v.literal("TERMS_AGREED"),
  v.literal("TOKEN_COLLECTED"),
  v.literal("DOCUMENTATION_IN_PROGRESS"),
  v.literal("READY_FOR_CLOSURE"),
  v.literal("CLOSED"),
  v.literal("FAILED"),
  v.literal("STALLED"),
  v.literal("EXPIRED"),
);
const negotiationProposalStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("SHARED"),
  v.literal("BOTH_AGREED"),
  v.literal("SUPERSEDED"),
);
const maintenancePaidByValidator = v.union(
  v.literal("TENANT"),
  v.literal("OWNER"),
  v.literal("SPLIT"),
);
const rentEscalationTypeValidator = v.union(
  v.literal("PERCENTAGE"),
  v.literal("FIXED_AMOUNT"),
  v.literal("NONE"),
);
const negotiationTermsRoomTypeValidator = v.union(
  v.literal("OPS_TENANT"),
  v.literal("OPS_OWNER"),
  v.literal("COMBINED"),
);
const negotiationTermsSignerRoleValidator = v.union(v.literal("TENANT"), v.literal("OWNER"));
const negotiationChecklistStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
  v.literal("OBTAINED"),
  v.literal("VERIFIED"),
  v.literal("DRAFT_READY"),
  v.literal("STAMP_REGISTERED"),
  v.literal("WAIVED"),
);
const channelTypeValidator = v.union(
  v.literal("OPS_TENANT"),
  v.literal("OPS_OWNER"),
  v.literal("COMBINED"),
);
const tokenCollectionMethodValidator = v.union(
  v.literal("CASH"),
  v.literal("UPI"),
  v.literal("BANK_TRANSFER"),
  v.literal("CHEQUE"),
);
const tokenRefundPolicyValidator = v.union(
  v.literal("NON_REFUNDABLE"),
  v.literal("REFUNDABLE_WITHIN_DAYS"),
  v.literal("PARTIAL_REFUND"),
  v.literal("CASE_BY_CASE"),
);
const tokenRecordStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("COLLECTED"),
  v.literal("REFUNDED"),
  v.literal("FORFEITED"),
  v.literal("DISPUTED"),
);
const rentalTransactionStatusValidator = v.union(
  v.literal("INITIATED"),
  v.literal("KYC_PENDING"),
  v.literal("KYC_VERIFIED"),
  v.literal("KYC_REJECTED"),
  v.literal("AGREEMENT_PENDING"),
  v.literal("AGREEMENT_SENT"),
  v.literal("AGREEMENT_SIGNED"),
  v.literal("TOKEN_PENDING"),
  v.literal("TOKEN_RECEIVED"),
  v.literal("DEPOSIT_PENDING"),
  v.literal("DEPOSIT_RECEIVED"),
  v.literal("MOVE_IN_SCHEDULED"),
  v.literal("COMPLETED"),
  v.literal("CANCELLED"),
);
const rentalAgreementStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("SENT"),
  v.literal("PARTIALLY_SIGNED"),
  v.literal("SIGNED"),
  v.literal("EXPIRED"),
  v.literal("CANCELLED"),
);
const kycPacketStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("IN_PROGRESS"),
  v.literal("PROVIDER_ERROR"),
  v.literal("NEEDS_REVIEW"),
  v.literal("VERIFIED"),
  v.literal("REJECTED"),
);
const policeVerificationStatusValidator = v.union(
  v.literal("NOT_STARTED"),
  v.literal("FORM_GENERATED"),
  v.literal("SUBMITTED"),
  v.literal("VERIFIED"),
  v.literal("REJECTED"),
);
const tokenBookingStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("RECORDED"),
  v.literal("CONFIRMED"),
  v.literal("DISPUTED"),
  v.literal("CANCELLED"),
);
const depositRecordStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("RECORDED"),
  v.literal("CONFIRMED"),
  v.literal("DISPUTED"),
  v.literal("CANCELLED"),
);
const chatChannelStatusValidator = v.union(v.literal("ACTIVE"), v.literal("ARCHIVED"));
const chatMessageStatusValidator = v.union(
  v.literal("SUBMITTED"),
  v.literal("BATCHED"),
  v.literal("PROCESSING"),
  v.literal("DELIVERED"),
  v.literal("FAILED"),
);
const chatBatchStatusValidator = v.union(
  v.literal("COLLECTING"),
  v.literal("PROCESSING"),
  v.literal("DELIVERED"),
  v.literal("FAILED"),
);
const chatSenderRoleValidator = v.union(
  v.literal("TENANT"),
  v.literal("OWNER"),
  v.literal("OPS"),
  v.literal("SYSTEM"),
);
const ownerInviteStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("CONSUMED"),
  v.literal("EXPIRED"),
  v.literal("REGENERATED"),
);
const visitStatusValidator = v.union(
  v.literal("ASSIGNED"),
  v.literal("CONFIRMED"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
  v.literal("CANCELLED"),
  v.literal("NO_SHOW"),
);
const visitOutcomeValidator = v.union(
  v.literal("INTERESTED"),
  v.literal("NOT_INTERESTED"),
  v.literal("FOLLOWUP"),
);
const closureStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("CONFIRMED"),
  v.literal("CANCELLED"),
);
const payoutMethodValidator = v.union(
  v.literal("CASH"),
  v.literal("UPI"),
  v.literal("BANK_TRANSFER"),
);
const payoutStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("disbursed"),
  v.literal("failed"),
  v.literal("voided"),
);
const referralTypeValidator = v.union(
  v.literal("TENANT_FINDING"),
  v.literal("OWNER_FINDING"),
  v.literal("GUARD"),
);
const referralStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("QUALIFIED"),
  v.literal("PARTIALLY_PAID"),
  v.literal("FULLY_PAID"),
  v.literal("VOIDED"),
);
const referralMilestoneTypeValidator = v.union(
  v.literal("SIGN_UP"),
  v.literal("LISTING_PUBLISHED"),
  v.literal("DEAL_CLOSED"),
  v.literal("FIRST_VERIFIED_LEAD"),
);
const referralMilestoneStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("TRIGGERED"),
  v.literal("APPROVED"),
  v.literal("PAID"),
  v.literal("VOIDED"),
);
const referralConfigScopeTypeValidator = v.union(
  v.literal("GLOBAL"),
  v.literal("SOCIETY"),
  v.literal("BUILDING"),
);
const incentiveCardTypeValidator = v.union(
  v.literal("lead_milestone"),
  v.literal("visit_milestone"),
  v.literal("quality_streak"),
  v.literal("speed_bonus"),
  v.literal("monthly_top"),
);
const incentiveLevelValidator = v.union(
  v.literal("BRONZE"),
  v.literal("SILVER"),
  v.literal("GOLD"),
  v.literal("PLATINUM"),
);
const qualityTierValidator = v.union(
  v.literal("BRONZE"),
  v.literal("SILVER"),
  v.literal("GOLD"),
  v.literal("PLATINUM"),
);
const streakTypeValidator = v.union(
  v.literal("DAILY_ACTIVE"),
  v.literal("WEEKLY_WARRIOR"),
  v.literal("QUALITY_CHAIN"),
  v.literal("PERFECT_10"),
);
const penaltyTypeValidator = v.union(
  v.literal("LOW_COMPLETENESS"),
  v.literal("MISSING_PHOTOS"),
  v.literal("FALSE_LEAD"),
  v.literal("NO_SHOW"),
  v.literal("CONSECUTIVE_POOR"),
);
const bonusTypeValidator = v.union(
  v.literal("FULL_CHECKLIST"),
  v.literal("ALL_GPS_PHOTOS"),
  v.literal("WITHIN_SLA"),
  v.literal("ALL_REQUIRED_DOCS"),
  v.literal("STREAK_MILESTONE"),
);
const qualityTriggerValidator = v.union(
  v.literal("CHECKLIST_APPROVED"),
  v.literal("VISIT_COMPLETED"),
  v.literal("DOCUMENTS_UPDATED"),
  v.literal("MANUAL_RECALC"),
  v.literal("CRON_DAILY"),
);
const incentiveAwardMethodValidator = v.union(v.literal("AUTO"), v.literal("MANUAL"));
const incentiveCardStatusValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("redeemed"),
);
const incentivePersonaValidator = v.union(
  v.literal("GUARD"),
  v.literal("OPS"),
  v.literal("SALES"),
  v.literal("RM"),
  v.literal("LIAISON"),
  v.literal("ALL"),
);
const contributionStageValidator = v.union(
  v.literal("DISCOVERY"),
  v.literal("VERIFICATION"),
  v.literal("CLOSURE"),
  v.literal("SUPPORT"),
);
const attributionAlgorithmValidator = v.union(
  v.literal("STAGE_WEIGHTED_QUALITY"),
  v.literal("EQUAL_SPLIT"),
  v.literal("MANUAL_OVERRIDE"),
);
const contributionSourceEntityValidator = v.union(
  v.literal("LEAD"),
  v.literal("VISIT"),
  v.literal("CLOSURE"),
  v.literal("AUDIT_LOG"),
  v.literal("MANUAL"),
);
const auditActorTypeValidator = v.union(
  v.literal("GUARD"),
  v.literal("ADMIN"),
  v.literal("OPS"),
  v.literal("TENANT"),
  v.literal("OWNER"),
  v.literal("SYSTEM"),
);
const auditActionValidator = v.union(
  v.literal("SOCIETIES_INSERT"),
  v.literal("SOCIETIES_UPDATE"),
  v.literal("BUILDINGS_INSERT"),
  v.literal("BUILDINGS_UPDATE"),
  v.literal("USERS_INSERT"),
  v.literal("USERS_UPDATE"),
  v.literal("GUARD_PROFILES_INSERT"),
  v.literal("GUARD_PROFILES_UPDATE"),
  v.literal("GUARD_SHIFTS_INSERT"),
  v.literal("GUARD_SHIFTS_UPDATE"),
  v.literal("GUARD_SHIFTS_DELETE"),
  v.literal("LEADS_INSERT"),
  v.literal("LEADS_UPDATE"),
  v.literal("OWNERS_INSERT"),
  v.literal("OWNERS_UPDATE"),
  v.literal("OWNER_RM_ASSIGNMENTS_INSERT"),
  v.literal("OWNER_RM_ASSIGNMENTS_UPDATE"),
  v.literal("RM_CHECK_INS_INSERT"),
  v.literal("OWNER_VERIFICATIONS_INSERT"),
  v.literal("LISTINGS_INSERT"),
  v.literal("LISTINGS_UPDATE"),
  v.literal("VISITS_INSERT"),
  v.literal("VISITS_UPDATE"),
  v.literal("CLOSURES_INSERT"),
  v.literal("CLOSURES_UPDATE"),
  v.literal("PAYOUTS_INSERT"),
  v.literal("PAYOUTS_UPDATE"),
  v.literal("REFERRAL_CODES_INSERT"),
  v.literal("REFERRAL_CODES_UPDATE"),
  v.literal("REFERRALS_INSERT"),
  v.literal("REFERRALS_UPDATE"),
  v.literal("REFERRAL_MILESTONES_INSERT"),
  v.literal("REFERRAL_MILESTONES_UPDATE"),
  v.literal("REFERRAL_CONFIG_INSERT"),
  v.literal("REFERRAL_CONFIG_UPDATE"),
  v.literal("TENANT_INQUIRIES_INSERT"),
  v.literal("TENANT_INQUIRIES_UPDATE"),
  v.literal("RENTAL_TRANSACTIONS_INSERT"),
  v.literal("RENTAL_TRANSACTIONS_UPDATE"),
  v.literal("RENTAL_AGREEMENTS_INSERT"),
  v.literal("RENTAL_AGREEMENTS_UPDATE"),
  v.literal("KYC_PACKETS_INSERT"),
  v.literal("KYC_PACKETS_UPDATE"),
  v.literal("TOKEN_BOOKINGS_INSERT"),
  v.literal("TOKEN_BOOKINGS_UPDATE"),
  v.literal("DEPOSIT_RECORDS_INSERT"),
  v.literal("DEPOSIT_RECORDS_UPDATE"),
  v.literal("HANDOVER_CHECKLISTS_INSERT"),
  v.literal("HANDOVER_CHECKLISTS_UPDATE"),
  v.literal("NEGOTIATIONS_INSERT"),
  v.literal("NEGOTIATIONS_UPDATE"),
  v.literal("NEGOTIATION_TERMS_PROPOSALS_INSERT"),
  v.literal("NEGOTIATION_TERMS_PROPOSALS_UPDATE"),
  v.literal("NEGOTIATION_TERMS_SIGNATURES_INSERT"),
  v.literal("NEGOTIATION_TOKEN_RECORDS_INSERT"),
  v.literal("NEGOTIATION_TOKEN_RECORDS_UPDATE"),
  v.literal("tenant_inquiry.negotiation_initiated"),
  v.literal("CHAT_CHANNELS_INSERT"),
  v.literal("CHAT_CHANNELS_UPDATE"),
  v.literal("CHAT_MESSAGES_INSERT"),
  v.literal("CHAT_MESSAGES_UPDATE"),
  v.literal("CHAT_MESSAGE_BATCHES_INSERT"),
  v.literal("CHAT_MESSAGE_BATCHES_UPDATE"),
  v.literal("CHAT_READ_RECEIPTS_INSERT"),
  v.literal("CHAT_READ_RECEIPTS_UPDATE"),
  v.literal("OWNER_INVITES_INSERT"),
  v.literal("OWNER_INVITES_UPDATE"),
  v.literal("OWNER_INVITES_DELETE"),
  v.literal("DEAL_CHECKLISTS_INSERT"),
  v.literal("DEAL_CHECKLISTS_UPDATE"),
  v.literal("DEAL_CHECKLISTS_DELETE"),
  v.literal("DEAL_CHECKLIST_SIGNATURES_INSERT"),
  v.literal("DEAL_CHECKLIST_SIGNATURES_UPDATE"),
  v.literal("DEAL_CHECKLIST_SIGNATURES_DELETE"),
  v.literal("INCENTIVE_CARDS_INSERT"),
  v.literal("INCENTIVE_CARDS_UPDATE"),
  v.literal("QUALITY_SCORE_HISTORY_INSERT"),
  v.literal("QUALITY_SCORE_HISTORY_UPDATE"),
  v.literal("GUARD_STREAKS_INSERT"),
  v.literal("GUARD_STREAKS_UPDATE"),
  v.literal("PAYOUT_ADJUSTMENTS_INSERT"),
  v.literal("PAYOUT_ADJUSTMENTS_UPDATE"),
  v.literal("ROLES_INSERT"),
  v.literal("ROLES_UPDATE"),
  v.literal("USER_ROLE_ASSIGNMENTS_INSERT"),
  v.literal("USER_ROLE_ASSIGNMENTS_UPDATE"),
  v.literal("SYSTEM_CONFIG_INSERT"),
  v.literal("SYSTEM_CONFIG_UPDATE"),
  v.literal("CHECKLIST_TEMPLATES_INSERT"),
  v.literal("CHECKLIST_TEMPLATES_UPDATE"),
  v.literal("CHECKLIST_INSTANCES_INSERT"),
  v.literal("CHECKLIST_INSTANCES_UPDATE"),
  v.literal("DOCUMENT_REQUIREMENTS_INSERT"),
  v.literal("DOCUMENT_REQUIREMENTS_UPDATE"),
  v.literal("REGULATORY_ITEMS_INSERT"),
  v.literal("REGULATORY_ITEMS_UPDATE"),
  v.literal("OWNER_SERVICE_REQUESTS_INSERT"),
  v.literal("OWNER_SERVICE_REQUESTS_UPDATE"),
  v.literal("SUPPORT_INQUIRIES_INSERT"),
  v.literal("SUPPORT_INQUIRIES_UPDATE"),
  v.literal("NOTIFICATION_PREFERENCES_INSERT"),
  v.literal("NOTIFICATION_PREFERENCES_UPDATE"),
  v.literal("NOTIFICATION_TEMPLATES_INSERT"),
  v.literal("NOTIFICATION_TEMPLATES_UPDATE"),
  v.literal("NOTIFICATIONS_INSERT"),
  v.literal("NOTIFICATIONS_UPDATE"),
  v.literal("DEAL_CONTRIBUTIONS_CREATE"),
  v.literal("DEAL_CONTRIBUTIONS_UPDATE"),
  v.literal("ATTRIBUTION_RECORDS_CREATE"),
  v.literal("ATTRIBUTION_RECORDS_UPDATE"),
  v.literal("ATTRIBUTION_SPLITS_CREATE"),
  v.literal("INCENTIVE_DISBURSEMENTS_CREATE"),
  v.literal("INCENTIVE_DISBURSEMENTS_UPDATE"),
  v.literal("GAMIFICATION_PROFILES_CREATE"),
  v.literal("GAMIFICATION_PROFILES_UPDATE"),
  v.literal("GAMIFICATION_QUESTS_CREATE"),
  v.literal("GAMIFICATION_QUESTS_UPDATE"),
  v.literal("USER_QUEST_PROGRESS_CREATE"),
  v.literal("USER_QUEST_PROGRESS_UPDATE"),
  v.literal("TRUST_BADGE_COMPUTE"),
  v.literal("TRUST_BADGE_UPDATE"),
  v.literal("COMMISSION_EVALUATE"),
  v.literal("ATTRIBUTION_COMPUTE"),
  v.literal("DISBURSEMENT_CREATE"),
  v.literal("DISBURSEMENT_APPROVE"),
  v.literal("DISBURSEMENT_VOID"),
  v.literal("CONFIG_VERSION_ACTIVATE"),
  v.literal("CONFIG_VERSION_ARCHIVE"),
  v.literal("MODIFIER_TEMPLATE_CREATE"),
  v.literal("MODIFIER_TEMPLATE_UPDATE"),
  v.literal("TRANSACTION_FEES_INSERT"),
  v.literal("TRANSACTION_FEES_UPDATE"),
  v.literal("TRANSACTION_FEES_DELETE"),
  v.literal("TENANT_PASSES_INSERT"),
  v.literal("TENANT_PASSES_UPDATE"),
  v.literal("TENANT_PASSES_DELETE"),
  v.literal("PARTNER_SERVICES_INSERT"),
  v.literal("PARTNER_SERVICES_UPDATE"),
  v.literal("PARTNER_SERVICES_DELETE"),
  v.literal("SERVICE_BUNDLES_INSERT"),
  v.literal("SERVICE_BUNDLES_UPDATE"),
  v.literal("SERVICE_BUNDLES_DELETE"),
  v.literal("PROMOTED_LISTINGS_INSERT"),
  v.literal("PROMOTED_LISTINGS_UPDATE"),
  v.literal("PROMOTED_LISTINGS_DELETE"),
  v.literal("REVENUE_LINE_ITEMS_INSERT"),
  v.literal("REVENUE_LINE_ITEMS_UPDATE"),
  v.literal("REVENUE_LINE_ITEMS_DELETE"),
  v.literal("transaction_fee.create"),
  v.literal("transaction_fee.update"),
  v.literal("transaction_fee.archive"),
  v.literal("tenant_pass.purchase"),
  v.literal("tenant_pass.activate"),
  v.literal("tenant_pass.consume"),
  v.literal("tenant_pass.expire"),
  v.literal("tenant_pass.refund"),
  v.literal("tenant_pass.void"),
  v.literal("partner_service.create"),
  v.literal("partner_service.update"),
  v.literal("service_bundle.create"),
  v.literal("service_bundle.update_status"),
  v.literal("service_bundle.cancel"),
  v.literal("promoted_listing.create"),
  v.literal("promoted_listing.activate"),
  v.literal("promoted_listing.pause"),
  v.literal("promoted_listing.end"),
  v.literal("promoted_listing.cancel"),
  v.literal("revenue_line_item.create"),
  v.literal("revenue_line_item.reverse"),
);
const systemConfigKeyValidator = v.union(
  v.literal("max_leads_per_guard_per_day"),
  v.literal("dedup_flat_window_days"),
  v.literal("dedup_phone_window_days"),
  v.literal("incentive_lead_submitter_bronze"),
  v.literal("incentive_lead_submitter_silver"),
  v.literal("incentive_lead_submitter_gold"),
  v.literal("incentive_lead_submitter_platinum"),
  v.literal("incentive_visit_handler_bronze"),
  v.literal("incentive_visit_handler_silver"),
  v.literal("incentive_visit_handler_gold"),
  v.literal("incentive_visit_handler_platinum"),
  v.literal("incentive_quality_champion_bronze"),
  v.literal("incentive_quality_champion_silver"),
  v.literal("incentive_quality_champion_gold"),
  v.literal("incentive_quality_champion_platinum"),
  v.literal("incentive_quality_champion_min_leads"),
  v.literal("quality_score_weights"),
  v.literal("quality_weight_checklist"),
  v.literal("quality_weight_photo"),
  v.literal("quality_weight_speed"),
  v.literal("quality_weight_verification"),
  v.literal("quality_weight_document"),
  v.literal("quality_tier_bronze_min"),
  v.literal("quality_tier_silver_min"),
  v.literal("quality_tier_gold_min"),
  v.literal("quality_tier_platinum_min"),
  v.literal("streak_bonus_3day_paise"),
  v.literal("streak_bonus_7day_paise"),
  v.literal("streak_bonus_14day_paise"),
  v.literal("streak_bonus_30day_paise"),
  v.literal("penalty_no_show_paise"),
  v.literal("min_quality_score_for_incentives"),
  v.literal("demorentals_contact_phone"),
  v.literal("demorentals_whatsapp_phone"),
  v.literal("tenant_bounty_default_amount"),
  v.literal("tenant_bounty_expiry_days"),
  v.literal("negotiation_stale_days"),
  v.literal("negotiation_max_rounds"),
  v.literal("negotiation_token_agreement_days"),
  v.literal("tenant_bounty_default_expiry_days"),
  v.literal("seed_demo_version"),
  v.literal("chat_ai_model"),
  v.literal("chat_batch_window_ms"),
  v.literal("chat_max_message_length"),
  v.literal("chat_owner_invite_expiry_days"),
  v.literal("chat_pii_fail_action"),
  v.literal("notification_quiet_hours_start"),
  v.literal("notification_quiet_hours_end"),
  v.literal("notification_dedup_window_ms"),
  v.literal("notification_max_retries"),
  v.literal("notification_retry_base_ms"),
  v.literal("transaction_auto_cancel_days"),
  v.literal("kyc_provider_timeout_ms"),
  v.literal("esign_deadline_days"),
  v.literal("trust_badge_freshness_threshold_days"),
  v.literal("trust_badge_min_photos"),
  v.literal("incentive_v3_active_config_version"),
  v.literal("incentive_v3_feature_flags"),
  v.literal("incentive_v3_rollout_policy"),
  v.literal("incentive_v3_shadow_mode_enabled"),
  v.literal("incentive_v3_decommission_variance_threshold"),
  v.literal("ops_field_worker_enabled"),
  v.literal("ops_field_worker_canary_user_ids"),
  v.literal("default_unassigned_society_id"),
  v.literal("fee_slab_lt_20k_paise"),
  v.literal("fee_slab_bt_20k_40k_paise"),
  v.literal("fee_slab_bt_40k_80k_paise"),
  v.literal("discovery_pass_basic_price_paise"),
  v.literal("discovery_pass_basic_credit_paise"),
  v.literal("discovery_pass_plus_price_paise"),
  v.literal("discovery_pass_plus_credit_paise"),
  v.literal("discovery_pass_premium_price_paise"),
  v.literal("discovery_pass_premium_credit_paise"),
  v.literal("discovery_pass_validity_days"),
  v.literal("promotion_7d_price_paise"),
  v.literal("promotion_14d_price_paise"),
  v.literal("promotion_30d_price_paise"),
  v.literal("promoted_listings_max_per_page"),
  v.literal("promoted_listings_slots"),
);
const checklistDepthValidator = v.union(v.literal("LIGHT"), v.literal("MEDIUM"), v.literal("FULL"));
const checklistStatusValidator = v.union(
  v.literal("ASSIGNED"),
  v.literal("IN_PROGRESS"),
  v.literal("SUBMITTED"),
  v.literal("UNDER_REVIEW"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("REVISION_REQUESTED"),
);
const conditionRatingValidator = v.union(
  v.literal("EXCELLENT"),
  v.literal("GOOD"),
  v.literal("FAIR"),
  v.literal("POOR"),
  v.literal("NA"),
);
const checklistItemTypeValidator = v.union(
  v.literal("CONDITION"),
  v.literal("CHECKBOX"),
  v.literal("TEXT"),
  v.literal("NUMBER"),
  v.literal("PHOTO"),
  v.literal("PHOTO_CONDITION"),
);
const documentRequirementTypeValidator = v.union(
  v.literal("OWNER_DOCS"),
  v.literal("TENANT_DOCS"),
  v.literal("SOCIETY_DOCS"),
);
const documentItemStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("COLLECTED"),
  v.literal("VERIFIED"),
  v.literal("REJECTED"),
  v.literal("NA"),
);
const documentOverallStatusValidator = v.union(
  v.literal("NOT_STARTED"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETE"),
  v.literal("BLOCKED"),
);
const regulatoryItemTypeValidator = v.union(
  v.literal("POLICE_VERIFICATION"),
  v.literal("RENT_REGISTRATION"),
  v.literal("SOCIETY_NOC"),
  v.literal("STAMP_DUTY"),
);
const regulatoryStatusValidator = v.union(
  v.literal("NOT_STARTED"),
  v.literal("IN_PROGRESS"),
  v.literal("SUBMITTED"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("OVERDUE"),
  v.literal("WAIVED"),
);
const trustBadgeTypeValidator = v.union(
  v.literal("OWNER_VERIFIED"),
  v.literal("PHYSICALLY_INSPECTED"),
  v.literal("FRESH_LISTING"),
  v.literal("REAL_PHOTOS"),
  v.literal("VISITS_COMPLETED"),
  v.literal("CLOSURE_HISTORY"),
);
const freshnessStateValidator = v.union(v.literal("FRESH"), v.literal("AGING"), v.literal("STALE"));
const feeSlabKeyValidator = v.union(
  v.literal("LT_20K"),
  v.literal("BT_20K_40K"),
  v.literal("BT_40K_80K"),
  v.literal("GT_80K_CUSTOM"),
);
const passTypeValidator = v.union(
  v.literal("DISCOVERY_BASIC"),
  v.literal("DISCOVERY_PLUS"),
  v.literal("DISCOVERY_PREMIUM"),
);
const passStatusValidator = v.union(
  v.literal("PURCHASED"),
  v.literal("ACTIVE"),
  v.literal("PARTIALLY_CONSUMED"),
  v.literal("CONSUMED"),
  v.literal("EXPIRED"),
  v.literal("REFUNDED"),
  v.literal("VOIDED"),
);
const promotionStatusValidator = v.union(
  v.literal("PENDING_PAYMENT"),
  v.literal("SCHEDULED"),
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("ENDED"),
  v.literal("CANCELLED"),
);
const bundleStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
  v.literal("CANCELLED"),
);
const serviceCategoryValidator = v.union(
  v.literal("PACKERS_MOVERS"),
  v.literal("CLEANING"),
  v.literal("PAINTING"),
  v.literal("PEST_CONTROL"),
  v.literal("FURNITURE_RENTAL"),
  v.literal("OTHER"),
);
const commissionModelValidator = v.union(v.literal("FIXED"), v.literal("PERCENTAGE"));
const revenueLineTypeValidator = v.union(
  v.literal("FEE_GROSS"),
  v.literal("PASS_CREDIT"),
  v.literal("FEE_NET"),
  v.literal("SERVICE_GROSS"),
  v.literal("PARTNER_COST"),
  v.literal("SERVICE_COMMISSION"),
  v.literal("PROMOTION_REVENUE"),
  v.literal("REFUND"),
  v.literal("ADJUSTMENT"),
);

export default defineSchema({
  users: defineTable({
    workos_user_id: v.string(),
    user_type: userTypeValidator, // DEPRECATED by P45 — kept for migration compatibility
    user_types: v.optional(v.array(userTypeValidator)), // P45: additive persona array (e.g. ["TENANT", "OWNER"])
    active_persona: v.optional(userTypeValidator), // P45: which portal to show on login; must be member of user_types
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    status: userStatusValidator,
    must_change_password: v.boolean(),
  })
    .index("by_workos_user_id", ["workos_user_id"])
    .index("by_user_type", ["user_type"]) // DEPRECATED by P45 — kept for migration compatibility
    .index("by_active_persona", ["active_persona"]) // P45: replaces by_user_type for routing queries
    .index("by_phone", ["phone"])
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_type_and_status", ["user_type", "status"]), // DEPRECATED by P45

  guard_profiles: defineTable({
    user_id: v.id("users"),
    society_id: v.id("societies"),
    guard_type: guardTypeValidator,
    photo_storage_id: v.optional(v.id("_storage")),
    language_preference: v.optional(languagePreferenceValidator),
    has_seen_onboarding: v.boolean(),
    metadata: v.optional(
      v.object({
        languages: v.optional(v.array(v.string())),
        experience_years: v.optional(v.number()),
      }),
    ),
    quality_score: v.optional(v.number()),
    browser_fingerprints: v.optional(
      v.array(
        v.object({
          fingerprint: v.string(),
          first_seen: v.number(),
          last_seen: v.number(),
          flagged: v.boolean(),
          ip: v.optional(v.string()),
          device_label: v.optional(v.string()),
        }),
      ),
    ),
  })
    .index("by_user_id", ["user_id"])
    .index("by_society_id", ["society_id"])
    .index("by_guard_type", ["guard_type"])
    .index("by_society_and_type", ["society_id", "guard_type"])
    .index("by_quality_score", ["quality_score"]),

  tenant_profiles: defineTable({
    user_id: v.id("users"),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    preferences: v.optional(
      v.object({
        localities: v.optional(v.array(v.string())),
        budget_min: v.optional(v.number()),
        budget_max: v.optional(v.number()),
        property_types: v.optional(v.array(v.string())),
      }),
    ),
    saved_listings: v.optional(v.array(v.id("listings"))),
  }).index("by_user_id", ["user_id"]),

  roles: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    is_system_role: v.boolean(),
    is_deleted: v.boolean(),
  }).index("by_name", ["name"]),

  user_role_assignments: defineTable({
    user_id: v.id("users"),
    role_id: v.id("roles"),
    assigned_by_admin_id: v.id("users"),
    is_deleted: v.boolean(),
  })
    .index("by_user_id", ["user_id"])
    .index("by_role_id", ["role_id"]),

  system_config: defineTable({
    key: systemConfigKeyValidator,
    value: v.string(),
    updated_by_admin_id: v.id("users"),
  }).index("by_key", ["key"]),

  audit_logs: defineTable({
    actor_user_id: v.optional(v.id("users")),
    actor_type: auditActorTypeValidator,
    action: auditActionValidator,
    entity_type: v.string(),
    entity_id: v.string(),
    changes: v.optional(
      v.array(
        v.object({
          field: v.string(),
          old_value: v.any(),
          new_value: v.any(),
        }),
      ),
    ),
    metadata: v.optional(v.any()),
  })
    .index("by_actor_user_id", ["actor_user_id"])
    .index("by_entity", ["entity_type", "entity_id"])
    .index("by_action", ["action"])
    .index("by_entity_type", ["entity_type"]),

  societies: defineTable({
    name: v.string(),
    city: v.string(),
    address: v.optional(v.string()),
    status: societyStatusValidator,
    notes: v.optional(v.string()),
    created_by_admin_id: v.id("users"),
  })
    .index("by_city", ["city"])
    .index("by_status", ["status"])
    .index("by_name", ["name"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["city", "status"],
    }),

  buildings: defineTable({
    society_id: v.id("societies"),
    name: v.string(),
    total_floors: v.number(),
    flats_per_floor: v.optional(v.number()),
    total_flats: v.optional(v.number()),
    floor_labels: v.array(v.string()),
    flat_number_template: v.optional(
      v.object({
        prefix: v.optional(v.string()),
        floor_digits: v.number(),
        unit_digits: v.number(),
      }),
    ),
    status: buildingStatusValidator,
    notes: v.optional(v.string()),
    is_deleted: v.boolean(),
  })
    .index("by_society_id", ["society_id"])
    .index("by_society_and_name", ["society_id", "name"]),

  owners: defineTable({
    phone: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    user_id: v.optional(v.id("users")),
    source: ownerSourceValidator,
    first_lead_id: v.optional(v.id("leads")),
    active_properties_count: v.number(),
    total_leads_count: v.number(),
    total_closures_count: v.number(),
    current_rm_id: v.optional(v.id("users")),
    current_rm_guard_id: v.optional(v.id("guard_profiles")),
    lifecycle_stage: ownerLifecycleStageValidator,
    lifecycle_updated_at: v.number(),
    merged_into_id: v.optional(v.id("owners")),
    first_seen_at: v.number(),
    last_activity_at: v.number(),
    is_deleted: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_phone", ["phone"])
    .index("by_email", ["email"])
    .index("by_user_id", ["user_id"])
    .index("by_lifecycle", ["lifecycle_stage"])
    .index("by_current_rm", ["current_rm_guard_id"])
    .index("by_source", ["source"])
    .index("by_merged_into", ["merged_into_id"])
    .index("by_is_deleted", ["is_deleted"]),

  owner_rm_assignments: defineTable({
    owner_id: v.id("owners"),
    rm_guard_id: v.id("guard_profiles"),
    rm_user_id: v.id("users"),
    source_closure_id: v.optional(v.id("closures")),
    assigned_by: rmAssignedByValidator,
    assigned_by_admin_id: v.optional(v.id("users")),
    status: rmAssignmentStatusValidator,
    last_check_in_at: v.optional(v.number()),
    next_check_in_due: v.optional(v.number()),
    check_in_frequency_days: v.number(),
    missed_check_ins_count: v.number(),
    performance_score: v.optional(v.number()),
    sla_breach_count: v.number(),
    last_sla_breach_at: v.optional(v.number()),
    escalation_level: v.number(),
    reassigned_at: v.optional(v.number()),
    reassigned_to_guard_id: v.optional(v.id("guard_profiles")),
    reassignment_reason: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_owner", ["owner_id", "status"])
    .index("by_rm", ["rm_guard_id", "status"])
    .index("by_status", ["status"])
    .index("by_next_check_in", ["next_check_in_due"]),

  rm_check_ins: defineTable({
    assignment_id: v.id("owner_rm_assignments"),
    owner_id: v.id("owners"),
    rm_guard_id: v.id("guard_profiles"),
    check_in_type: rmCheckInTypeValidator,
    method: rmCheckInMethodValidator,
    summary: v.string(),
    outcome: rmCheckInOutcomeValidator,
    owner_satisfaction: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_assignment", ["assignment_id"])
    .index("by_owner", ["owner_id"])
    .index("by_rm", ["rm_guard_id"]),

  leads: defineTable({
    society_id: v.id("societies"),
    building_id: v.id("buildings"),
    floor_number: v.string(),
    flat_number: v.string(),
    owner_name: v.optional(v.string()),
    owner_phone: v.string(),
    owner_id: v.optional(v.id("owners")),
    availability_type: availabilityTypeValidator,
    availability_date: v.optional(v.number()),
    rent_expected: v.optional(v.number()),
    furnishing: v.optional(furnishingValidator),
    notes: v.optional(v.string()),
    owner_consent_to_call: v.boolean(),
    submitted_by_guard_id: v.id("users"),
    status: leadStatusValidator,
    notes_thread: v.optional(
      v.array(
        v.object({
          note: v.string(),
          author_id: v.id("users"),
          author_name: v.string(),
          author_type: v.union(v.literal("ADMIN"), v.literal("GUARD"), v.literal("OPS")),
          timestamp: v.number(),
        }),
      ),
    ),
    quality_flags: v.optional(v.array(leadQualityFlagValidator)),
    duplicate_of_lead_id: v.optional(v.id("leads")),
    prospective_bounty: v.optional(v.number()),
    searchable_text: v.optional(v.string()),
  })
    .index("by_society_id", ["society_id"])
    .index("by_building_id", ["building_id"])
    .index("by_status", ["status"])
    .index("by_submitted_by_guard_id", ["submitted_by_guard_id"])
    .index("by_owner_phone", ["owner_phone"])
    .index("by_owner_id", ["owner_id"])
    .index("by_society_and_status", ["society_id", "status"])
    .index("by_society_building_flat", ["society_id", "building_id", "flat_number"])
    .index("by_guard_and_status", ["submitted_by_guard_id", "status"])
    .searchIndex("search_leads", {
      searchField: "searchable_text",
      filterFields: ["status", "society_id"],
    }),

  guard_shifts: defineTable({
    guard_user_id: v.id("users"),
    shift_type: shiftTypeValidator,
    day_of_week: v.optional(v.number()),
    specific_date: v.optional(v.number()),
    start_time: v.string(),
    end_time: v.string(),
    location_type: locationTypeValidator,
    building_id: v.optional(v.id("buildings")),
    location_label: v.optional(v.string()),
    notes: v.optional(v.string()),
    created_by_admin_id: v.id("users"),
    is_deleted: v.boolean(),
  })
    .index("by_guard_user_id", ["guard_user_id"])
    .index("by_guard_and_day", ["guard_user_id", "day_of_week"])
    .index("by_guard_and_date", ["guard_user_id", "specific_date"])
    .index("by_guard_and_type", ["guard_user_id", "shift_type"]),

  owner_verifications: defineTable({
    lead_id: v.id("leads"),
    called_by_admin_id: v.id("users"),
    call_outcome: callOutcomeValidator,
    consent_contact_demorentals: v.boolean(),
    consent_visit_coordination: v.optional(v.boolean()),
    preferred_visit_slots: v.optional(v.string()),
    rent_confirmed: v.optional(v.number()),
    notes: v.optional(v.string()),
    verified_at: v.number(),
  }).index("by_lead_id", ["lead_id"]),

  listings: defineTable({
    lead_id: v.id("leads"),
    owner_id: v.optional(v.id("owners")),
    slug: v.string(),
    status: listingStatusValidator,
    rent_monthly: v.number(),
    deposit: v.optional(v.number()),
    maintenance: v.optional(v.number()),
    bhk_config: bhkConfigValidator,
    furnishing: furnishingValidator,
    floor_number: v.string(),
    carpet_area_sqft: v.optional(v.number()),
    available_from: v.number(),
    description: v.optional(v.string()),
    house_rules: v.optional(v.array(v.string())),
    parking: v.optional(parkingValidator),
    pet_friendly: v.optional(v.boolean()),
    amenities: v.optional(v.array(amenityValidator)),
    created_by_admin_id: v.id("users"),
  })
    .index("by_lead_id", ["lead_id"])
    .index("by_owner_id", ["owner_id"])
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  listing_photos: defineTable({
    listing_id: v.id("listings"),
    storage_id: v.id("_storage"),
    display_order: v.number(),
    is_deleted: v.boolean(),
  }).index("by_listing_id", ["listing_id"]),

  listing_trust_badges: defineTable({
    listing_id: v.id("listings"),
    badges: v.array(
      v.object({
        type: trustBadgeTypeValidator,
        earned: v.boolean(),
        timestamp: v.optional(v.number()),
        count: v.optional(v.number()),
      }),
    ),
    freshness_score: v.number(),
    freshness_state: freshnessStateValidator,
    last_activity_at: v.optional(v.number()),
    last_computed_at: v.number(),
    evidence: v.optional(
      v.object({
        photo_count: v.optional(v.number()),
        visit_count: v.optional(v.number()),
        has_closure: v.optional(v.boolean()),
      }),
    ),
    is_deleted: v.boolean(),
  })
    .index("by_listing_id", ["listing_id"])
    .index("by_freshness_state", ["freshness_state"])
    .index("by_is_deleted", ["is_deleted"]),

  listing_roommate_profiles: defineTable({
    listing_id: v.id("listings"),
    name_alias: v.string(),
    age_range: v.optional(v.string()),
    gender: v.optional(v.string()),
    profession: v.optional(v.string()),
    lifestyle_tags: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    move_in_date: v.optional(v.number()),
    is_deleted: v.boolean(),
  }).index("by_listing_id", ["listing_id", "is_deleted"]),

  listing_commute_landmarks: defineTable({
    listing_id: v.id("listings"),
    name: v.string(),
    category: v.string(),
    distance_km: v.number(),
    time_minutes: v.optional(v.number()),
    transport_mode: v.optional(v.string()),
    is_deleted: v.boolean(),
  }).index("by_listing_id", ["listing_id", "is_deleted"]),

  listing_inquiries: defineTable({
    listing_id: v.id("listings"),
    name: v.string(),
    phone: v.string(),
    message: v.optional(v.string()),
    source: listingInquirySourceValidator,
  }).index("by_listing_id", ["listing_id"]),

  tenant_inquiries: defineTable({
    listing_id: v.id("listings"),
    tenant_id: v.optional(v.id("users")),
    transaction_id: v.optional(v.id("rental_transactions")),
    tenant_name: v.string(),
    tenant_phone: v.string(),
    tenant_email: v.optional(v.string()),
    preferred_visit_date: v.optional(v.number()),
    preferred_visit_slot: v.optional(v.string()),
    message: v.optional(v.string()),
    status: tenantInquiryStatusValidator,
    bounty_amount: v.optional(v.number()),
    bounty_posted_at: v.optional(v.number()),
    bounty_expires_at: v.optional(v.number()),
    assigned_guard_id: v.optional(v.id("users")),
    visit_id: v.optional(v.id("visits")),
    ops_notes: v.optional(v.string()),
    rejection_reason: v.optional(v.string()),
    reviewed_by_admin_id: v.optional(v.id("users")),
    updated_at: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_listing_id", ["listing_id"])
    .index("by_tenant_id", ["tenant_id"])
    .index("by_transaction_id", ["transaction_id"])
    .index("by_tenant_and_status", ["tenant_id", "status"])
    .index("by_assigned_guard_id", ["assigned_guard_id"])
    .index("by_tenant_phone", ["tenant_phone"]),

  rental_transactions: defineTable({
    tenant_user_id: v.id("users"),
    listing_id: v.id("listings"),
    owner_id: v.id("owners"),
    closure_id: v.optional(v.id("closures")),
    tenant_inquiry_id: v.optional(v.id("tenant_inquiries")),
    source_negotiation_id: v.optional(v.string()),
    status: rentalTransactionStatusValidator,
    monthly_rent_paise: v.number(),
    deposit_amount_paise: v.number(),
    token_booking_amount: v.optional(v.number()),
    move_in_date: v.optional(v.number()),
    cancellation_reason: v.optional(v.string()),
    last_override_reason: v.optional(v.string()),
    last_override_by: v.optional(v.string()),
    last_override_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_tenant", ["tenant_user_id"])
    .index("by_listing", ["listing_id"])
    .index("by_status", ["status"])
    .index("by_owner", ["owner_id"])
    // Reserved for future admin filter queries
    .index("by_tenant_inquiry_id", ["tenant_inquiry_id"])
    // Reserved for future admin filter queries
    .index("by_created_at", ["created_at"]),

  rental_agreements: defineTable({
    transaction_id: v.id("rental_transactions"),
    template_version: v.string(),
    terms: v.object({
      monthly_rent_paise: v.number(),
      deposit_amount_paise: v.number(),
      lock_in_months: v.optional(v.number()),
      notice_period_months: v.optional(v.number()),
      maintenance_paise: v.optional(v.number()),
      escalation_percent: v.optional(v.number()),
      agreement_start_date: v.optional(v.number()),
      agreement_end_date: v.optional(v.number()),
      special_conditions: v.optional(v.string()),
    }),
    tenant_signature: v.optional(
      v.object({
        signed_at: v.number(),
        signer_name: v.optional(v.string()),
        signer_email: v.optional(v.string()),
        session_id: v.optional(v.string()),
        signature_payload: v.string(),
      }),
    ),
    owner_signature: v.optional(
      v.object({
        signed_at: v.number(),
        signer_name: v.optional(v.string()),
        signer_email: v.optional(v.string()),
        session_id: v.optional(v.string()),
        signature_payload: v.string(),
      }),
    ),
    document_storage_id: v.optional(v.id("_storage")),
    status: rentalAgreementStatusValidator,
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_transaction_id", ["transaction_id"])
    .index("by_status", ["status"]),

  kyc_packets: defineTable({
    transaction_id: v.id("rental_transactions"),
    tenant_user_id: v.id("users"),
    aadhaar_verified: v.boolean(),
    employer_verified: v.boolean(),
    landlord_reference: v.optional(
      v.object({
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
    overall_status: kycPacketStatusValidator,
    status_note: v.optional(v.string()),
    police_verification_status: v.optional(policeVerificationStatusValidator),
    police_form_storage_id: v.optional(v.id("_storage")),
    police_ack_storage_id: v.optional(v.id("_storage")),
    verified_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_transaction_id", ["transaction_id"])
    .index("by_tenant", ["tenant_user_id"]),

  token_bookings: defineTable({
    transaction_id: v.id("rental_transactions"),
    amount_paise: v.number(),
    policy_snapshot: v.object({
      refund_type: v.string(), // Validated at mutation level via tokenRefundTypeValidator
      conditions: v.optional(v.string()),
    }),
    payment_reference: v.optional(v.string()),
    receipt_storage_id: v.optional(v.id("_storage")),
    refunded_by: v.optional(v.id("users")),
    refunded_at: v.optional(v.number()),
    refund_amount_paise: v.optional(v.number()),
    refund_reference: v.optional(v.string()),
    override_reason: v.optional(v.string()),
    override_approved_by: v.optional(v.id("users")),
    cancelled_by: v.optional(v.id("users")),
    cancelled_at: v.optional(v.number()),
    cancel_reason: v.optional(v.string()),
    status: tokenBookingStatusValidator,
    status_note: v.optional(v.string()),
    held_at: v.number(),
    resolved_at: v.optional(v.number()),
    is_deleted: v.boolean(),
  })
    .index("by_transaction_id", ["transaction_id"])
    .index("by_status", ["status"]),

  deposit_records: defineTable({
    transaction_id: v.id("rental_transactions"),
    amount_paise: v.number(),
    paid_by_tenant_at: v.optional(v.number()),
    confirmed_by_owner_at: v.optional(v.number()),
    payment_reference: v.optional(v.string()),
    receipt_storage_id: v.optional(v.id("_storage")),
    payment_events: v.optional(
      v.array(
        v.object({
          amount_paise: v.number(),
          payment_reference: v.optional(v.string()),
          recorded_at: v.number(),
          recorded_by: v.id("users"),
        }),
      ),
    ),
    mismatch_reason: v.optional(v.string()),
    override_reason: v.optional(v.string()),
    override_by: v.optional(v.id("users")),
    override_at: v.optional(v.number()),
    compliance_warning: v.optional(v.string()),
    status: depositRecordStatusValidator,
    status_note: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_transaction_id", ["transaction_id"])
    .index("by_status", ["status"]),

  handover_checklists: defineTable({
    transaction_id: v.id("rental_transactions"),
    items: v.array(
      v.object({
        label: v.string(),
        checked: v.boolean(),
        checked_at: v.optional(v.number()),
        checked_by: v.optional(v.id("users")),
      }),
    ),
    completed_at: v.optional(v.number()),
    completed_by: v.optional(v.id("users")),
    is_deleted: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_transaction_id", ["transaction_id"]),

  negotiations: defineTable({
    tenant_inquiry_id: v.id("tenant_inquiries"),
    listing_id: v.id("listings"),
    tenant_user_id: v.id("users"),
    owner_user_id: v.optional(v.id("users")),
    initiated_by_admin_id: v.id("users"),
    status: negotiationStatusValidator,
    failure_reason: v.optional(v.string()),
    failure_notes: v.optional(v.string()),
    ops_tenant_channel_id: v.optional(v.id("chat_channels")),
    ops_owner_channel_id: v.optional(v.id("chat_channels")),
    combined_channel_id: v.optional(v.id("chat_channels")),
    active_proposal_id: v.optional(v.id("negotiation_terms_proposals")),
    police_verification_status: v.optional(negotiationChecklistStatusValidator),
    society_noc_status: v.optional(negotiationChecklistStatusValidator),
    owner_kyc_status: v.optional(negotiationChecklistStatusValidator),
    agreement_drafting_status: v.optional(v.string()),
    stamp_registration_status: v.optional(v.string()),
    rent_agreement_storage_id: v.optional(v.id("_storage")),
    rent_agreement_status: v.optional(negotiationChecklistStatusValidator),
    key_handover_status: v.optional(negotiationChecklistStatusValidator),
    move_in_inspection_status: v.optional(negotiationChecklistStatusValidator),
    move_in_inspection_notes: v.optional(v.string()),
    police_verification_waive_reason: v.optional(v.string()),
    society_noc_waive_reason: v.optional(v.string()),
    owner_kyc_waive_reason: v.optional(v.string()),
    rent_agreement_waive_reason: v.optional(v.string()),
    key_handover_waive_reason: v.optional(v.string()),
    move_in_inspection_waive_reason: v.optional(v.string()),
    initiated_at: v.number(),
    terms_agreed_at: v.optional(v.number()),
    ready_for_closure_at: v.optional(v.number()),
    failed_at: v.optional(v.number()),
    last_activity_at: v.number(),
    stale_flagged: v.boolean(),
    rounds_flagged: v.boolean(),
    is_stale: v.optional(v.boolean()),
    too_many_rounds: v.optional(v.boolean()),
    token_without_agreement: v.optional(v.boolean()),
    escalation_flags_updated_at: v.optional(v.number()),
    flag_dismissed_at: v.optional(v.number()),
    flag_dismissed_reason: v.optional(v.string()),
    is_deleted: v.boolean(),
  })
    .index("by_tenant_inquiry_id", ["tenant_inquiry_id"])
    .index("by_listing_id", ["listing_id"])
    .index("by_tenant_user_id", ["tenant_user_id"])
    .index("by_owner_user_id", ["owner_user_id"])
    .index("by_status", ["status"])
    .index("by_status_last_activity", ["status", "last_activity_at"])
    .index("by_status_initiated", ["status", "initiated_at"])
    .index("by_initiated_by_admin_id", ["initiated_by_admin_id"])
    .index("by_last_activity_at", ["last_activity_at"]),

  negotiation_terms_proposals: defineTable({
    negotiation_id: v.id("negotiations"),
    version: v.number(),
    status: negotiationProposalStatusValidator,
    monthly_rent_paise: v.number(),
    security_deposit_paise: v.number(),
    security_deposit_months: v.number(),
    lock_in_period_months: v.number(),
    notice_period_months: v.number(),
    move_in_date: v.number(),
    maintenance_charges_paise: v.number(),
    maintenance_paid_by: maintenancePaidByValidator,
    rent_escalation_type: rentEscalationTypeValidator,
    rent_escalation_value: v.number(),
    furnishing_terms: v.string(),
    brokerage_tenant_side_paise: v.number(),
    brokerage_owner_side_paise: v.number(),
    token_advance_amount_paise: v.number(),
    special_conditions: v.optional(v.string()),
    created_by_admin_id: v.id("users"),
    created_at: v.number(),
    shared_to_rooms: v.optional(v.array(negotiationTermsRoomTypeValidator)),
    shared_at: v.optional(v.number()),
    is_locked: v.boolean(),
    locked_at: v.optional(v.number()),
    is_deleted: v.boolean(),
  })
    .index("by_negotiation_id", ["negotiation_id"])
    .index("by_status", ["status"])
    .index("by_negotiation_and_version", ["negotiation_id", "version"]),

  negotiation_terms_signatures: defineTable({
    proposal_id: v.id("negotiation_terms_proposals"),
    negotiation_id: v.id("negotiations"),
    user_id: v.id("users"),
    user_role: negotiationTermsSignerRoleValidator,
    signed_at: v.number(),
    agreement_text: v.string(),
    proposal_version: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_proposal_id", ["proposal_id"])
    .index("by_proposal_user", ["proposal_id", "user_id", "is_deleted"])
    .index("by_negotiation_id", ["negotiation_id"])
    .index("by_user_id", ["user_id"]),

  negotiation_token_records: defineTable({
    negotiation_id: v.id("negotiations"),
    amount_paise: v.number(),
    collected_at: v.number(),
    collection_method: tokenCollectionMethodValidator,
    refund_policy: tokenRefundPolicyValidator,
    refund_days: v.optional(v.number()),
    refund_percentage: v.optional(v.number()),
    tenant_agreed_at: v.number(),
    status: tokenRecordStatusValidator,
    collected_by_admin_id: v.id("users"),
    notes: v.optional(v.string()),
    is_deleted: v.boolean(),
  })
    .index("by_negotiation_id", ["negotiation_id"])
    .index("by_status", ["status"]),

  chat_channels: defineTable({
    inquiry_id: v.id("tenant_inquiries"),
    channel_type: v.optional(channelTypeValidator),
    negotiation_id: v.optional(v.id("negotiations")),
    status: chatChannelStatusValidator,
    created_by_admin_id: v.id("users"),
    created_at: v.number(),
  })
    .index("by_inquiry_id", ["inquiry_id"])
    .index("by_negotiation_id", ["negotiation_id"])
    .index("by_status", ["status"]),

  owner_invites: defineTable({
    inquiry_id: v.id("tenant_inquiries"),
    channel_id: v.id("chat_channels"),
    invite_token: v.string(),
    owner_expected_email: v.optional(v.string()),
    identity_verified: v.optional(v.boolean()),
    status: ownerInviteStatusValidator,
    expires_at: v.number(),
    consumed_at: v.optional(v.number()),
    consumed_by_user_id: v.optional(v.id("users")),
    created_by_admin_id: v.id("users"),
    created_at: v.number(),
  })
    .index("by_token", ["invite_token"])
    .index("by_inquiry_id", ["inquiry_id"])
    .index("by_inquiry_and_status", ["inquiry_id", "status"])
    .index("by_status", ["status"])
    .index("by_status_expires", ["status", "expires_at"]),

  chat_messages: defineTable({
    channel_id: v.id("chat_channels"),
    sender_user_id: v.id("users"),
    sender_role: chatSenderRoleValidator,
    original_content: v.string(),
    masked_content: v.optional(v.string()),
    batch_id: v.optional(v.id("chat_message_batches")),
    status: chatMessageStatusValidator,
    failure_reason: v.optional(v.string()),
    admin_review_required: v.boolean(),
    is_ai_processed: v.boolean(),
    is_impersonated: v.optional(v.boolean()),
    impersonated_by_admin_id: v.optional(v.id("users")),
    is_deleted: v.optional(v.boolean()),
    created_at: v.number(),
    delivered_at: v.optional(v.number()),
  })
    .index("by_channel_id", ["channel_id"])
    .index("by_batch_id", ["batch_id"])
    .index("by_status", ["status"])
    .index("by_channel_and_created", ["channel_id", "created_at"])
    .index("by_channel_delivered", ["channel_id", "delivered_at"]),

  chat_message_batches: defineTable({
    channel_id: v.id("chat_channels"),
    sender_user_id: v.id("users"),
    messages: v.array(v.id("chat_messages")),
    combined_original: v.string(),
    masked_content: v.optional(v.string()),
    pii_detected: v.optional(v.array(v.string())),
    status: chatBatchStatusValidator,
    failure_reason: v.optional(v.string()),
    created_at: v.number(),
    processing_started_at: v.optional(v.number()),
    processed_at: v.optional(v.number()),
  })
    .index("by_channel_id", ["channel_id"])
    .index("by_status", ["status"])
    .index("by_channel_sender_status", ["channel_id", "sender_user_id", "status"])
    .index("by_channel_and_created", ["channel_id", "created_at"]),

  chat_read_receipts: defineTable({
    channel_id: v.id("chat_channels"),
    user_id: v.id("users"),
    last_read_message_id: v.id("chat_messages"),
    last_read_at: v.number(),
  }).index("by_channel_and_user", ["channel_id", "user_id"]),

  deal_checklists: defineTable({
    inquiry_id: v.id("tenant_inquiries"),
    channel_id: v.id("chat_channels"),
    version: v.number(),
    previous_version_id: v.optional(v.id("deal_checklists")),
    items: v.array(
      v.object({
        item_id: v.string(),
        term_type: v.union(
          v.literal("RENT_AMOUNT"),
          v.literal("DEPOSIT"),
          v.literal("LEASE_DURATION"),
          v.literal("MOVE_IN_DATE"),
          v.literal("MAINTENANCE"),
          v.literal("ESCALATION_CLAUSE"),
          v.literal("FURNISHING"),
          v.literal("LOCK_IN_PERIOD"),
          v.literal("NOTICE_PERIOD"),
          v.literal("BROKERAGE"),
          v.literal("CUSTOM"),
        ),
        source: v.union(
          v.literal("AI_EXTRACTED"),
          v.literal("ADMIN_ADDED"),
          v.literal("PARTY_RAISED"),
        ),
        description: v.string(),
        extracted_value: v.optional(v.string()),
        admin_edited_value: v.optional(v.string()),
        source_message_ids: v.optional(v.array(v.id("chat_messages"))),
        confidence: v.optional(v.number()),
        tenant_approval: v.object({
          status: v.union(
            v.literal("PENDING"),
            v.literal("AGREED"),
            v.literal("DISAGREED"),
            v.literal("COMMENTED"),
          ),
          responded_at: v.optional(v.number()),
          comment: v.optional(v.string()),
        }),
        owner_approval: v.object({
          status: v.union(
            v.literal("PENDING"),
            v.literal("AGREED"),
            v.literal("DISAGREED"),
            v.literal("COMMENTED"),
          ),
          responded_at: v.optional(v.number()),
          comment: v.optional(v.string()),
        }),
        overall_status: v.union(
          v.literal("UNREVIEWED"),
          v.literal("RESOLVED"),
          v.literal("DISPUTED"),
          v.literal("NEEDS_DISCUSSION"),
        ),
      }),
    ),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("SHARED"),
      v.literal("IN_REVIEW"),
      v.literal("APPROVED"),
      v.literal("DISPUTED"),
      v.literal("SUPERSEDED"),
    ),
    created_by_admin_id: v.id("users"),
    created_at: v.number(),
    shared_at: v.optional(v.number()),
    approved_at: v.optional(v.number()),
  })
    .index("by_inquiry_id", ["inquiry_id"])
    .index("by_channel_id", ["channel_id"])
    .index("by_status", ["status"])
    .index("by_inquiry_and_version", ["inquiry_id", "version"]),

  deal_checklist_signatures: defineTable({
    checklist_id: v.id("deal_checklists"),
    signer_user_id: v.id("users"),
    signer_role: v.union(v.literal("TENANT"), v.literal("OWNER")),
    signature_hash: v.string(),
    signed_at: v.number(),
    ip_address: v.optional(v.string()),
  })
    .index("by_checklist_id", ["checklist_id"])
    .index("by_signer", ["signer_user_id", "checklist_id"]),

  visits: defineTable({
    lead_id: v.id("leads"),
    society_id: v.id("societies"),
    listing_id: v.optional(v.id("listings")),
    scheduled_start: v.number(),
    scheduled_end: v.number(),
    assigned_guard_id: v.id("users"),
    status: visitStatusValidator,
    outcome: v.optional(visitOutcomeValidator),
    outcome_notes: v.optional(v.string()),
    started_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
    needs_reassignment: v.optional(v.boolean()),
    checklist_instance_id: v.optional(v.id("checklist_instances")),
    tenant_inquiry_id: v.optional(v.id("tenant_inquiries")),
    created_by_admin_id: v.id("users"),
  })
    .index("by_lead_id", ["lead_id"])
    .index("by_assigned_guard_id", ["assigned_guard_id"])
    .index("by_status", ["status"])
    .index("by_scheduled_start", ["scheduled_start"])
    .index("by_guard_and_status", ["assigned_guard_id", "status"])
    .index("by_society_id", ["society_id"])
    .index("by_needs_reassignment", ["needs_reassignment"])
    .index("by_tenant_inquiry_id", ["tenant_inquiry_id"]),

  closures: defineTable({
    lead_id: v.id("leads"),
    listing_id: v.optional(v.id("listings")),
    owner_id: v.optional(v.id("owners")),
    visit_id: v.optional(v.id("visits")),
    transaction_id: v.optional(v.id("rental_transactions")),
    negotiation_id: v.optional(v.id("negotiations")),
    demorentals_deal_id: v.optional(v.string()),
    move_in_date: v.number(),
    status: closureStatusValidator,
    rent_agreement_storage_id: v.optional(v.id("_storage")),
    commission_amount: v.optional(v.number()),
    brokerage_tenant_side: v.optional(v.number()),
    brokerage_owner_side: v.optional(v.number()),
    notes: v.optional(v.string()),
    additional_documents: v.optional(
      v.array(
        v.object({
          name: v.string(),
          storage_id: v.id("_storage"),
        }),
      ),
    ),
    deal_checklist_id: v.optional(v.id("deal_checklists")),
    closed_by_admin_id: v.id("users"),
    confirmed_at: v.optional(v.number()),
  })
    .index("by_lead_id", ["lead_id"])
    .index("by_owner_id", ["owner_id"])
    .index("by_visit_id", ["visit_id"])
    .index("by_transaction_id", ["transaction_id"])
    .index("by_negotiation_id", ["negotiation_id"])
    .index("by_status", ["status"]),

  payouts: defineTable({
    guard_user_id: v.id("users"),
    lead_id: v.id("leads"),
    closure_id: v.id("closures"),
    amount_paise: v.number(),
    method: v.optional(payoutMethodValidator),
    status: payoutStatusValidator,
    initiated_by_admin_id: v.id("users"),
    approved_by_admin_id: v.optional(v.id("users")),
    approved_at: v.optional(v.number()),
    disbursed_at: v.optional(v.number()),
    payment_reference: v.optional(v.string()),
    failure_reason: v.optional(v.string()),
    voided_reason: v.optional(v.string()),
    voided_by: v.optional(v.id("users")),
    voided_at: v.optional(v.number()),
  })
    .index("by_guard_user_id", ["guard_user_id"])
    .index("by_status", ["status"])
    .index("by_lead_id", ["lead_id"])
    .index("by_closure_id", ["closure_id"]),

  quality_score_history: defineTable({
    guard_user_id: v.id("users"),
    score: v.number(),
    components: v.object({
      checklist: v.number(),
      photo: v.number(),
      speed: v.number(),
      verification: v.number(),
      document: v.number(),
    }),
    trigger: qualityTriggerValidator,
    tier: qualityTierValidator,
    computed_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_guard", ["guard_user_id"])
    .index("by_guard_and_date", ["guard_user_id", "computed_at"]),

  guard_streaks: defineTable({
    guard_user_id: v.id("users"),
    streak_type: streakTypeValidator,
    current_count: v.number(),
    longest_count: v.number(),
    is_active: v.boolean(),
    last_activity_date: v.string(),
    started_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_guard", ["guard_user_id"])
    .index("by_guard_and_type", ["guard_user_id", "streak_type"])
    .index("by_active", ["is_active"]),

  payout_adjustments: defineTable({
    payout_id: v.id("payouts"),
    guard_user_id: v.id("users"),
    base_amount_paise: v.number(),
    quality_score: v.number(),
    quality_tier: qualityTierValidator,
    quality_multiplier: v.number(),
    streak_bonus_paise: v.number(),
    task_bonuses: v.array(
      v.object({
        bonus_type: bonusTypeValidator,
        label: v.string(),
        amount_paise: v.number(),
        percentage: v.optional(v.number()),
      }),
    ),
    task_bonuses_total_paise: v.number(),
    penalties: v.array(
      v.object({
        penalty_type: penaltyTypeValidator,
        label: v.string(),
        amount_paise: v.number(),
      }),
    ),
    penalty_total_paise: v.number(),
    suggested_total_paise: v.number(),
    admin_override_paise: v.optional(v.number()),
    final_amount_paise: v.number(),
    computed_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_payout", ["payout_id"])
    .index("by_guard", ["guard_user_id"]),

  incentive_cards: defineTable({
    guard_user_id: v.id("users"),
    card_type: incentiveCardTypeValidator,
    level: incentiveLevelValidator,
    awarded_method: incentiveAwardMethodValidator,
    title: v.string(),
    description: v.string(),
    badge_icon: v.string(),
    reward_amount_paise: v.optional(v.number()),
    awarded_reason: v.optional(v.string()),
    awarded_by_admin_id: v.optional(v.id("users")),
    earned_at: v.optional(v.number()),
    rejected_at: v.optional(v.number()),
    redeemed_at: v.optional(v.number()),
    expires_at: v.optional(v.number()),
    metadata: v.optional(v.any()),
    status: incentiveCardStatusValidator,
  })
    .index("by_guard_user_id", ["guard_user_id"])
    .index("by_card_type", ["card_type"])
    .index("by_guard_and_type", ["guard_user_id", "card_type"])
    .index("by_status", ["status"]),

  analytics_snapshots: defineTable({
    snapshot_date: v.string(),
    snapshot_type: v.string(),
    data: v.any(),
  })
    .index("by_date", ["snapshot_date"])
    .index("by_type_and_date", ["snapshot_type", "snapshot_date"]),

  support_inquiries: defineTable({
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    subject: v.string(),
    message: v.string(),
    preferred_contact_method: v.optional(supportInquiryPreferredContactMethodValidator),
    persona_type: v.optional(supportInquiryPersonaTypeValidator),
    source_channel: v.optional(v.string()),
    status: supportInquiryStatusValidator,
    ops_notes: v.optional(v.string()),
    assigned_admin_id: v.optional(v.id("users")),
    resolved_at: v.optional(v.number()),
    closed_at: v.optional(v.number()),
    ip_address: v.optional(v.string()),
    is_deleted: v.boolean(),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_persona_type", ["persona_type"])
    .index("by_assigned_admin_id", ["assigned_admin_id"])
    .index("by_is_deleted", ["is_deleted"]),

  notification_preferences: defineTable({
    user_id: v.id("users"),
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    quiet_hours_start: v.optional(v.string()),
    quiet_hours_end: v.optional(v.string()),
    whatsapp_opt_out: v.optional(v.boolean()),
    channels_enabled: v.object({
      in_app: v.boolean(),
      push: v.boolean(),
      whatsapp: v.boolean(),
      sms: v.boolean(),
      email: v.boolean(),
    }),
    category_settings: v.array(
      v.object({
        category: notificationCategoryValidator,
        channels: v.object({
          in_app: v.boolean(),
          push: v.boolean(),
          whatsapp: v.boolean(),
          sms: v.boolean(),
          email: v.boolean(),
        }),
      }),
    ),
    is_deleted: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user_id", ["user_id"])
    .index("by_is_deleted", ["is_deleted"]),

  notification_templates: defineTable({
    event_type: v.string(),
    category: notificationCategoryValidator,
    channel: notificationChannelValidator,
    locale: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    variables: v.array(v.string()),
    version: v.optional(v.number()),
    is_active: v.boolean(),
    is_deleted: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_event_channel_locale", ["event_type", "channel", "locale"])
    .index("by_category_channel", ["category", "channel"])
    .index("by_is_active", ["is_active"]),

  notification_events: defineTable({
    user_id: v.id("users"),
    event_type: v.string(),
    category: notificationCategoryValidator,
    severity: notificationSeverityValidator,
    status: notificationEventStatusValidator,
    channels: v.array(notificationChannelValidator),
    payload: v.any(),
    dedup_key: v.optional(v.string()),
    channel_status: v.optional(
      v.record(
        v.string(),
        v.object({
          status: notificationChannelDeliveryStatusValidator,
          attempt_count: v.number(),
          last_error: v.optional(v.string()),
          scheduled_at: v.optional(v.number()),
          delivered_at: v.optional(v.number()),
          failed_at: v.optional(v.number()),
          provider_message_id: v.optional(v.string()),
        }),
      ),
    ),
    retry_count: v.number(),
    next_attempt_at: v.optional(v.number()),
    last_error: v.optional(v.string()),
    final_error: v.optional(v.string()),
    provider_message_id: v.optional(v.string()),
    attempted_at: v.optional(v.number()),
    delivered_at: v.optional(v.number()),
    failed_at: v.optional(v.number()),
    is_deleted: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user_id", ["user_id"])
    .index("by_status", ["status"])
    .index("by_final_status", ["status", "failed_at"])
    .index("by_status_and_next_attempt", ["status", "next_attempt_at"])
    .index("by_provider_message_id", ["provider_message_id"])
    .index("by_dedup_key", ["dedup_key"])
    .index("by_category_and_created", ["category", "created_at"]),

  notifications: defineTable({
    user_id: v.id("users"),
    event_id: v.optional(v.id("notification_events")),
    category: notificationCategoryValidator,
    severity: notificationSeverityValidator,
    channel: notificationChannelValidator,
    title: v.string(),
    body: v.string(),
    action_url: v.optional(v.string()),
    metadata: v.optional(v.any()),
    is_read: v.boolean(),
    read_at: v.optional(v.number()),
    is_deleted: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user_id", ["user_id"])
    .index("by_user_and_created", ["user_id", "created_at"])
    .index("by_user_and_is_read", ["user_id", "is_read"])
    .index("by_user_read_created", ["user_id", "is_read", "created_at"]),

  push_subscriptions: defineTable({
    user_id: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    user_agent: v.optional(v.string()),
    device_fingerprint: v.optional(v.string()),
    last_error: v.optional(v.string()),
    is_active: v.boolean(),
    is_deleted: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user_id", ["user_id"])
    .index("by_endpoint", ["endpoint"])
    .index("by_user_and_active", ["user_id", "is_active"]),

  newsletter_subscriptions: defineTable({
    email: v.string(),
    source_page: v.optional(v.string()),
    subscribed_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_email", ["email"])
    .index("by_is_deleted", ["is_deleted"]),

  checklist_templates: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    depth: checklistDepthValidator,
    is_active: v.boolean(),
    is_deleted: v.boolean(),
    sections: v.array(
      v.object({
        section_id: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        items: v.array(
          v.object({
            item_id: v.string(),
            label: v.string(),
            item_type: checklistItemTypeValidator,
            is_required: v.boolean(),
            requires_photo: v.boolean(),
            min_depth: checklistDepthValidator,
          }),
        ),
      }),
    ),
  })
    .index("by_depth_and_active", ["depth", "is_active"])
    .index("by_name_and_depth", ["name", "depth"])
    .index("by_is_active", ["is_active"]),

  checklist_instances: defineTable({
    template_id: v.id("checklist_templates"),
    visit_id: v.id("visits"),
    assigned_to: v.id("users"),
    assigned_by: v.id("users"),
    depth: checklistDepthValidator,
    status: checklistStatusValidator,
    completeness_score: v.number(),
    responses: v.array(
      v.object({
        item_id: v.string(),
        section_id: v.string(),
        value: v.optional(v.string()),
        condition_rating: v.optional(conditionRatingValidator),
        photo_ids: v.array(v.id("_storage")),
        photo_metadata: v.array(
          v.object({
            storage_id: v.id("_storage"),
            taken_at: v.number(),
            lat: v.optional(v.number()),
            lng: v.optional(v.number()),
          }),
        ),
        notes: v.optional(v.string()),
        completed_at: v.optional(v.number()),
      }),
    ),
    review_notes: v.optional(v.string()),
    reviewed_by: v.optional(v.id("users")),
    reviewed_at: v.optional(v.number()),
    submitted_at: v.optional(v.number()),
    started_at: v.optional(v.number()),
    is_deleted: v.boolean(),
  })
    .index("by_status", ["status"])
    .index("by_assigned_to", ["assigned_to"])
    .index("by_visit_id", ["visit_id"])
    .index("by_template_id", ["template_id"]),

  document_requirements: defineTable({
    lead_id: v.optional(v.id("leads")),
    listing_id: v.optional(v.id("listings")),
    closure_id: v.optional(v.id("closures")),
    requirement_type: documentRequirementTypeValidator,
    assigned_to: v.optional(v.id("users")),
    assigned_by: v.optional(v.id("users")),
    overall_status: documentOverallStatusValidator,
    items: v.array(
      v.object({
        item_id: v.string(),
        label: v.string(),
        description: v.optional(v.string()),
        is_required: v.boolean(),
        status: documentItemStatusValidator,
        storage_id: v.optional(v.id("_storage")),
        file_type: v.optional(v.string()),
        file_size: v.optional(v.number()),
        collected_at: v.optional(v.number()),
        collected_by: v.optional(v.id("users")),
        verified_at: v.optional(v.number()),
        verified_by: v.optional(v.id("users")),
        rejection_notes: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
    notes: v.optional(v.string()),
    is_deleted: v.boolean(),
  })
    .index("by_lead_id", ["lead_id"])
    .index("by_listing_id", ["listing_id"])
    .index("by_closure_id", ["closure_id"])
    .index("by_assigned_to", ["assigned_to"])
    .index("by_overall_status", ["overall_status"]),

  regulatory_items: defineTable({
    closure_id: v.id("closures"),
    item_type: regulatoryItemTypeValidator,
    status: regulatoryStatusValidator,
    reference_number: v.optional(v.string()),
    sla_deadline: v.optional(v.number()),
    submitted_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
    assigned_to: v.optional(v.id("users")),
    assigned_by: v.optional(v.id("users")),
    linked_document_ids: v.array(v.id("_storage")),
    notes: v.optional(v.string()),
    escalation_notes: v.optional(v.string()),
    is_deleted: v.boolean(),
  })
    .index("by_closure_id", ["closure_id"])
    .index("by_status", ["status"])
    .index("by_assigned_to", ["assigned_to"])
    .index("by_sla_deadline", ["sla_deadline"])
    .index("by_item_type", ["item_type"]),

  owner_service_requests: defineTable({
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    property_type: v.optional(v.string()),
    location: v.optional(v.string()),
    property_value: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: ownerServiceRequestStatusValidator,
    ops_notes: v.optional(v.string()),
    assigned_admin_id: v.optional(v.id("users")),
    contacted_at: v.optional(v.number()),
    owner_user_id: v.optional(v.id("users")),
  })
    .index("by_status", ["status"])
    .index("by_phone", ["phone"])
    .index("by_assigned_admin_id", ["assigned_admin_id"]),

  referral_codes: defineTable({
    user_id: v.id("users"),
    code: v.string(),
    is_active: v.boolean(),
  })
    .index("by_user_id", ["user_id"])
    .index("by_code", ["code"]),

  referrals: defineTable({
    referrer_user_id: v.id("users"),
    referred_user_id: v.id("users"),
    referral_code_id: v.optional(v.id("referral_codes")),
    referral_type: referralTypeValidator,
    status: referralStatusValidator,
    lead_id: v.optional(v.id("leads")),
    listing_id: v.optional(v.id("listings")),
    closure_id: v.optional(v.id("closures")),
    building_id: v.optional(v.id("buildings")),
    society_id: v.optional(v.id("societies")),
    attributed_by_admin_id: v.optional(v.id("users")),
    attributed_at: v.optional(v.number()),
    attribution_source: v.optional(v.string()),
    voided_reason: v.optional(v.string()),
    voided_by_admin_id: v.optional(v.id("users")),
  })
    .index("by_referrer_user_id", ["referrer_user_id"])
    .index("by_referred_user_id", ["referred_user_id"])
    .index("by_referral_type", ["referral_type"])
    .index("by_status", ["status"])
    .index("by_closure_id", ["closure_id"]),

  referral_milestones: defineTable({
    referral_id: v.id("referrals"),
    milestone_type: referralMilestoneTypeValidator,
    amount: v.number(),
    status: referralMilestoneStatusValidator,
    source_event: v.optional(v.string()),
    triggered_at: v.optional(v.number()),
    approved_by_admin_id: v.optional(v.id("users")),
    paid_at: v.optional(v.number()),
    payout_method: v.optional(payoutMethodValidator),
    voided_reason: v.optional(v.string()),
  })
    .index("by_referral_id", ["referral_id"])
    .index("by_referral_and_source_event", ["referral_id", "source_event"])
    .index("by_status", ["status"])
    .index("by_milestone_type", ["milestone_type"]),

  referral_config: defineTable({
    referral_type: referralTypeValidator,
    scope_type: referralConfigScopeTypeValidator,
    scope_id: v.optional(v.string()),
    sign_up_bonus: v.number(),
    finding_bonus_total: v.number(),
    publish_split_pct: v.number(),
    closure_split_pct: v.number(),
    is_active: v.boolean(),
    updated_by_admin_id: v.id("users"),
  })
    .index("by_referral_type", ["referral_type"])
    .index("by_scope", ["scope_type", "scope_id"]),

  // Incentive v3 tables
  incentive_actor_profiles: defineTable({
    user_id: v.id("users"),
    persona: incentivePersonaValidator,
    commission_base_bps: v.optional(v.number()),
    commission_min_bps: v.optional(v.number()),
    commission_max_bps: v.optional(v.number()),
    effective_from: v.number(),
    effective_to: v.optional(v.number()),
    is_active: v.boolean(),
    assigned_by: v.id("users"),
    updated_by: v.optional(v.id("users")),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  })
    .index("by_user", ["user_id"])
    .index("by_persona_active", ["persona", "is_active"]),

  deal_commission_evaluations: defineTable({
    closure_id: v.id("closures"),
    primary_actor_user_id: v.id("users"),
    persona: incentivePersonaValidator,
    base_rate_bps: v.number(),
    effective_rate_bps: v.number(),
    flat_bonus_paise: v.number(),
    commission_base_profit_paise: v.number(),
    incentive_pool_paise: v.number(),
    modifier_breakdown: v.array(
      v.object({
        template_id: v.id("commission_modifier_templates"),
        template_name: v.string(),
        reward_mode: v.union(v.literal("BPS"), v.literal("FLAT_PAISE")),
        delta_bps: v.optional(v.float64()),
        delta_paise: v.optional(v.int64()),
        link_mode: v.union(v.literal("INDIVIDUAL"), v.literal("AND_GROUP"), v.literal("OR_GROUP")),
        link_group_id: v.optional(v.string()),
        passed: v.boolean(),
      }),
    ),
    config_version: v.string(),
    config_snapshot: v.string(),
    computed_at: v.number(),
    status: v.union(v.literal("DRAFT"), v.literal("FINAL"), v.literal("VOIDED")),
  })
    .index("by_closure", ["closure_id"])
    .index("by_primary_actor", ["primary_actor_user_id", "computed_at"])
    .index("by_computed_at", ["computed_at"])
    .index("by_persona_computed_at", ["persona", "computed_at"]),

  commission_modifier_templates: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    persona: incentivePersonaValidator,
    reward_mode: v.union(v.literal("BPS"), v.literal("FLAT_PAISE")),
    rule_type: v.union(
      v.literal("threshold_step"),
      v.literal("linear_band"),
      v.literal("penalty_step"),
    ),
    metric_source: v.string(),
    rule_config_json: v.string(),
    link_mode: v.union(v.literal("INDIVIDUAL"), v.literal("AND_GROUP"), v.literal("OR_GROUP")),
    link_group_id: v.optional(v.string()),
    is_active: v.boolean(),
    sort_order: v.number(),
    created_by: v.id("users"),
    updated_by: v.optional(v.id("users")),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  })
    .index("by_persona_active", ["persona", "is_active"])
    .index("by_link_group", ["link_group_id"]),

  incentive_config_versions: defineTable({
    version_code: v.string(),
    status: v.union(v.literal("DRAFT"), v.literal("ACTIVE"), v.literal("ARCHIVED")),
    config_json: v.string(),
    optimizer_bounds_json: v.optional(v.string()),
    description: v.optional(v.string()),
    created_by: v.id("users"),
    activated_by: v.optional(v.id("users")),
    activated_at: v.optional(v.number()),
    archived_by: v.optional(v.id("users")),
    archived_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  })
    .index("by_version", ["version_code"])
    .index("by_status", ["status"]),

  shadow_mode_deltas: defineTable({
    deal_id: v.id("closures"),
    entity_type: v.union(
      v.literal("commission"),
      v.literal("attribution"),
      v.literal("disbursement"),
    ),
    persona: v.optional(incentivePersonaValidator),
    config_version_id: v.optional(v.id("incentive_config_versions")),
    v2_result_json: v.string(),
    v3_result_json: v.string(),
    delta_summary: v.string(),
    created_at: v.number(),
  })
    .index("by_deal", ["deal_id"])
    .index("by_entity_type", ["entity_type", "persona", "created_at"]),

  deal_contributions: defineTable({
    closure_id: v.id("closures"),
    lead_id: v.optional(v.id("leads")),
    actor_user_id: v.id("users"),
    actor_persona: incentivePersonaValidator,
    stage: contributionStageValidator,
    source_entity_type: contributionSourceEntityValidator,
    source_entity_id: v.string(),
    event_key: v.string(),
    contribution_units: v.number(),
    quality_score_snapshot: v.optional(v.number()),
    timeliness_score_snapshot: v.optional(v.number()),
    handoff_from_user_id: v.optional(v.id("users")),
    handoff_reason: v.optional(v.string()),
    occurred_at: v.number(),
    metadata: v.optional(v.any()),
    is_voided: v.boolean(),
    voided_reason: v.optional(v.string()),
    voided_by_admin_id: v.optional(v.id("users")),
    voided_at: v.optional(v.number()),
    is_deleted: v.boolean(),
  })
    .index("by_closure_stage", ["closure_id", "stage"])
    .index("by_actor", ["actor_user_id", "occurred_at"])
    .index("by_closure", ["closure_id"])
    .index("by_source", ["source_entity_type", "source_entity_id"])
    .index("by_event_key", ["event_key"]),

  attribution_records: defineTable({
    closure_id: v.id("closures"),
    lead_id: v.id("leads"),
    deal_commission_evaluation_id: v.id("deal_commission_evaluations"),
    algorithm: attributionAlgorithmValidator,
    algorithm_version: v.string(),
    pool_amount_paise: v.number(),
    total_adj_points: v.optional(v.number()),
    config_version: v.string(),
    config_snapshot: v.string(),
    status: v.union(
      v.literal("PROVISIONAL"),
      v.literal("FINAL"),
      v.literal("DISPUTED"),
      v.literal("RESOLVED"),
    ),
    dispute_reason: v.optional(v.string()),
    disputed_by_admin_id: v.optional(v.id("users")),
    disputed_at: v.optional(v.number()),
    override_reason: v.optional(v.string()),
    overridden_by_admin_id: v.optional(v.id("users")),
    overridden_at: v.optional(v.number()),
    resolved_by_admin_id: v.optional(v.id("users")),
    resolution_notes: v.optional(v.string()),
    supersedes_record_id: v.optional(v.id("attribution_records")),
    computed_at: v.number(),
    finalized_at: v.optional(v.number()),
    resolved_at: v.optional(v.number()),
    is_deleted: v.optional(v.boolean()),
  })
    .index("by_closure", ["closure_id"])
    .index("by_status", ["status"])
    .index("by_supersedes_record_id", ["supersedes_record_id"])
    .index("by_computed_at", ["computed_at"]),

  attribution_splits: defineTable({
    attribution_record_id: v.id("attribution_records"),
    closure_id: v.id("closures"),
    recipient_user_id: v.id("users"),
    recipient_persona: incentivePersonaValidator,
    primary_stage: v.optional(contributionStageValidator),
    contribution_count: v.optional(v.number()),
    raw_points: v.optional(v.number()),
    adj_points: v.optional(v.number()),
    share_bps: v.number(),
    share_bps_display: v.optional(v.number()),
    provisional_amount_paise: v.optional(v.number()),
    residue_numerator: v.optional(v.number()),
    remainder_rank: v.optional(v.number()),
    amount_paise: v.number(),
    contribution_points: v.number(),
    contribution_ids: v.array(v.id("deal_contributions")),
    is_manual_override: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    created_at: v.number(),
    is_deleted: v.optional(v.boolean()),
  })
    .index("by_recipient", ["recipient_user_id", "created_at"])
    .index("by_closure", ["closure_id"])
    .index("by_attribution", ["attribution_record_id"]),

  incentive_disbursements: defineTable({
    recipient_user_id: v.id("users"),
    recipient_persona: incentivePersonaValidator,
    source_type: v.union(
      v.literal("ATTRIBUTION_SPLIT"),
      v.literal("QUEST_REWARD"),
      v.literal("TEAM_POOL"),
      v.literal("V2_MIGRATION"),
    ),
    source_record_id: v.string(),
    source_key: v.string(),
    closure_id: v.optional(v.id("closures")),
    amount_paise: v.number(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("APPROVED"),
      v.literal("DISBURSED"),
      v.literal("FAILED"),
      v.literal("VOIDED"),
    ),
    approved_by_admin_id: v.optional(v.id("users")),
    approved_at: v.optional(v.number()),
    disbursed_at: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_recipient_status", ["recipient_user_id", "status"])
    .index("by_closure", ["closure_id"])
    .index("by_source_key", ["source_key"]),

  transaction_fees: defineTable({
    slab_key: feeSlabKeyValidator,
    rent_min_paise: v.number(),
    rent_max_paise: v.optional(v.number()),
    fee_amount_paise: v.number(),
    is_custom_quote: v.boolean(),
    effective_from: v.number(),
    effective_until: v.optional(v.number()),
    is_active: v.boolean(),
    created_by: v.id("users"),
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_slab_key", ["slab_key", "is_active"])
    .index("by_active", ["is_active", "effective_from"]),

  tenant_passes: defineTable({
    tenant_id: v.id("users"),
    pass_type: passTypeValidator,
    status: passStatusValidator,
    purchase_amount_paise: v.number(),
    credit_value_paise: v.number(),
    remaining_credit_paise: v.number(),
    total_consumed_paise: v.number(),
    consumption_count: v.number(),
    purchased_at: v.number(),
    activated_at: v.optional(v.number()),
    expires_at: v.number(),
    razorpay_order_id: v.optional(v.string()),
    razorpay_payment_id: v.optional(v.string()),
    refund_amount_paise: v.optional(v.number()),
    refund_reason: v.optional(v.string()),
    refunded_at: v.optional(v.number()),
    refund_id: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_tenant_status", ["tenant_id", "status"])
    .index("by_tenant", ["tenant_id"])
    .index("by_status", ["status"])
    .index("by_razorpay_order", ["razorpay_order_id"])
    .index("by_razorpay_payment", ["razorpay_payment_id"]),

  partner_services: defineTable({
    name: v.string(),
    slug: v.string(),
    category: serviceCategoryValidator,
    description: v.string(),
    partner_name: v.string(),
    base_price_paise: v.number(),
    commission_model: commissionModelValidator,
    commission_value: v.number(),
    is_active: v.boolean(),
    created_by: v.id("users"),
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_category", ["category", "is_active"])
    .index("by_slug", ["slug"])
    .index("by_active", ["is_active"]),

  service_bundles: defineTable({
    tenant_id: v.id("users"),
    closure_id: v.optional(v.id("closures")),
    partner_service_id: v.id("partner_services"),
    listing_id: v.optional(v.id("listings")),
    status: bundleStatusValidator,
    order_amount_paise: v.number(),
    commission_amount_paise: v.number(),
    partner_payout_paise: v.number(),
    ordered_at: v.number(),
    completed_at: v.optional(v.number()),
    cancelled_at: v.optional(v.number()),
    cancellation_reason: v.optional(v.string()),
    notes: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_tenant", ["tenant_id"])
    .index("by_closure", ["closure_id"])
    .index("by_status", ["status"])
    .index("by_partner_service", ["partner_service_id"]),

  promoted_listings: defineTable({
    listing_id: v.id("listings"),
    owner_id: v.id("users"),
    status: promotionStatusValidator,
    duration_days: v.union(v.literal(7), v.literal(14), v.literal(30)),
    starts_at: v.number(),
    ends_at: v.number(),
    price_paise: v.number(),
    razorpay_order_id: v.optional(v.string()),
    razorpay_payment_id: v.optional(v.string()),
    impressions: v.number(),
    clicks: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
    is_deleted: v.boolean(),
  })
    .index("by_listing", ["listing_id"])
    .index("by_status", ["status"])
    .index("by_status_time", ["status", "starts_at", "ends_at"])
    .index("by_razorpay_order", ["razorpay_order_id"])
    .index("by_razorpay_payment", ["razorpay_payment_id"]),

  revenue_line_items: defineTable({
    event_id: v.string(),
    idempotency_key: v.string(),
    line_type: revenueLineTypeValidator,
    direction: v.union(v.literal("credit"), v.literal("debit")),
    amount_paise: v.number(),
    closure_id: v.optional(v.id("closures")),
    tenant_pass_id: v.optional(v.id("tenant_passes")),
    service_bundle_id: v.optional(v.id("service_bundles")),
    promoted_listing_id: v.optional(v.id("promoted_listings")),
    rent_amount_paise: v.optional(v.number()),
    fee_slab_key: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("posted"), v.literal("reversed")),
    reversal_event_id: v.optional(v.string()),
    description: v.string(),
    metadata: v.optional(v.any()), // v.any() justified: arbitrary JSON metadata for audit context
    created_at: v.number(),
    created_by: v.optional(v.id("users")),
    is_deleted: v.boolean(),
  })
    .index("by_event_id", ["event_id"])
    .index("by_idempotency_key", ["idempotency_key"])
    .index("by_closure", ["closure_id"])
    .index("by_line_type", ["line_type", "status"])
    .index("by_status", ["status"])
    .index("by_created_at", ["created_at"])
    .index("by_tenant_pass", ["tenant_pass_id"])
    .index("by_promoted_listing", ["promoted_listing_id"]),

  gamification_profiles: defineTable({
    user_id: v.id("users"),
    persona: incentivePersonaValidator,
    xp_total: v.number(),
    level: v.number(),
    weekly_tier: v.string(),
    weekly_xp: v.number(),
    last_weekly_reset_week: v.optional(v.string()),
    streak_days: v.number(),
    last_streak_date: v.optional(v.string()),
    longest_streak: v.number(),
    streak_freezes_remaining: v.number(),
    streak_freezes_used_this_month: v.number(),
    badges: v.array(v.string()),
    is_active: v.boolean(),
    updated_at: v.number(),
  }).index("by_user_persona", ["user_id", "persona"]),

  gamification_quests: defineTable({
    quest_code: v.string(),
    applicable_personas: v.array(incentivePersonaValidator),
    scope: v.union(v.literal("INDIVIDUAL"), v.literal("TEAM")),
    target_metric_key: v.string(),
    target_value: v.number(),
    reward_type: v.union(v.literal("XP"), v.literal("PAISE"), v.literal("PERK")),
    reward_value: v.number(),
    start_at: v.number(),
    end_at: v.number(),
    status: v.union(v.literal("ACTIVE"), v.literal("ENDED")),
  })
    .index("by_start", ["start_at"])
    .index("by_status", ["status"]),

  user_quest_progress: defineTable({
    user_id: v.id("users"),
    quest_id: v.id("gamification_quests"),
    progress: v.number(),
    target: v.number(),
    completed: v.boolean(),
    claimed: v.boolean(),
    completed_at: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_user", ["user_id"])
    .index("by_quest", ["quest_id"]),

  voice_transcriptions: defineTable({
    storage_id: v.id("_storage"),
    transcript: v.string(),
    language: v.string(),
    user_id: v.id("users"),
    entity_type: v.string(),
    entity_id: v.string(),
    duration_ms: v.number(),
    is_deleted: v.boolean(),
    deleted_by: v.optional(v.id("users")),
    deleted_at: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_user_id", ["user_id"])
    .index("by_entity", ["entity_type", "entity_id"])
    .index("by_entity_user", ["entity_type", "entity_id", "user_id"])
    .index("by_storage_id", ["storage_id"])
    .index("by_created_at", ["created_at"]),
});
```

---

## Table Documentation Additions

### Phase 46 - CEO Ops Command Center (OPS)

#### Table: `ops_kpi_targets`

Tracks per-agent KPI targets for weekly, monthly, or quarterly windows. Used by OPS management dashboards and by field workers' self-view target tracking.

| Field            | Validator                     | Description                                                  |
| ---------------- | ----------------------------- | ------------------------------------------------------------ |
| `agent_user_id`  | `v.id("users")`               | OPS agent whose KPI is being tracked                         |
| `set_by_user_id` | `v.id("users")`               | User who set or updated the target                           |
| `metric`         | `opsKpiMetricValidator`       | KPI metric key (for example visits/closures/quality metrics) |
| `target_value`   | `v.number()`                  | Expected metric value for the period                         |
| `period_type`    | `opsKpiPeriodTypeValidator`   | Window type (`WEEKLY`/`MONTHLY`/`QUARTERLY`)                 |
| `period_start`   | `v.number()`                  | Period start timestamp (Unix ms)                             |
| `period_end`     | `v.number()`                  | Period end timestamp (Unix ms)                               |
| `actual_value`   | `v.optional(v.number())`      | Latest computed actual value                                 |
| `progress_pct`   | `v.optional(v.number())`      | Progress percentage toward target                            |
| `status`         | `opsKpiTargetStatusValidator` | Target lifecycle state                                       |
| `notes`          | `v.optional(v.string())`      | Optional context from reviewer/manager                       |
| `created_at`     | `v.number()`                  | Created timestamp (Unix ms)                                  |
| `updated_at`     | `v.number()`                  | Last updated timestamp (Unix ms)                             |
| `is_deleted`     | `v.boolean()`                 | Soft-delete flag                                             |

**Indexes**

- `by_agent` -> `agent_user_id, period_type, status`
- `by_period` -> `period_start, period_end`
- `by_status` -> `status`
- `by_agent_metric_period` -> `agent_user_id, metric, period_start`

**Search indexes**

- None

System fields `_id` and `_creationTime` are auto-managed by Convex.

#### Table: `ops_warnings`

Stores structured warning records for OPS agents, including escalation lineage and lifecycle transitions. Used for active warning panels, auto-expiry/escalation checks, and manual warning workflows.

| Field               | Validator                          | Description                                  |
| ------------------- | ---------------------------------- | -------------------------------------------- |
| `agent_user_id`     | `v.id("users")`                    | OPS agent receiving the warning              |
| `issued_by_user_id` | `v.optional(v.id("users"))`        | Issuer when warning is user-issued           |
| `issued_by_type`    | `opsWarningIssuedByTypeValidator`  | Whether warning came from `SYSTEM` or `USER` |
| `warning_level`     | `v.number()`                       | Severity level (`1`, `2`, `3+`)              |
| `trigger_type`      | `opsWarningTriggerTypeValidator`   | Warning trigger mode (`AUTO` or `MANUAL`)    |
| `trigger_reason`    | `opsWarningTriggerReasonValidator` | Canonical reason for issuance                |
| `description`       | `v.string()`                       | Human-readable warning summary               |
| `evidence`          | `v.optional(v.string())`           | Optional serialized evidence/context         |
| `status`            | `opsWarningStatusValidator`        | Warning lifecycle status                     |
| `acknowledged_at`   | `v.optional(v.number())`           | Acknowledgement timestamp (Unix ms)          |
| `resolved_at`       | `v.optional(v.number())`           | Resolution timestamp (Unix ms)               |
| `resolution_notes`  | `v.optional(v.string())`           | Resolution details                           |
| `escalated_from_id` | `v.optional(v.id("ops_warnings"))` | Parent warning when created via escalation   |
| `expires_at`        | `v.optional(v.number())`           | Expiry timestamp used by cron checks         |
| `created_at`        | `v.number()`                       | Created timestamp (Unix ms)                  |
| `updated_at`        | `v.number()`                       | Last updated timestamp (Unix ms)             |
| `is_deleted`        | `v.boolean()`                      | Soft-delete flag                             |

**Indexes**

- `by_agent` -> `agent_user_id, status`
- `by_level` -> `warning_level, status`
- `by_status` -> `status, created_at`
- `by_status_expires_at` -> `status, expires_at`
- `by_agent_level_reason_status` -> `agent_user_id, warning_level, trigger_reason, status`

**Search indexes**

- None

System fields `_id` and `_creationTime` are auto-managed by Convex.

#### Table: `ops_check_in_notes`

Captures manager check-in notes for OPS agents with structured action items. Used for review history, open action item follow-up, and team health monitoring.

| Field                         | Validator                                  | Description                                |
| ----------------------------- | ------------------------------------------ | ------------------------------------------ |
| `agent_user_id`               | `v.id("users")`                            | OPS agent being reviewed                   |
| `reviewer_user_id`            | `v.id("users")`                            | Reviewer who recorded the check-in         |
| `notes`                       | `v.string()`                               | Free-form review note                      |
| `action_items`                | `v.array(v.object(...))`                   | Structured action item list                |
| `action_items[].description`  | `v.string()`                               | Action item description                    |
| `action_items[].due_date`     | `v.optional(v.number())`                   | Optional due date (Unix ms)                |
| `action_items[].completed`    | `v.boolean()`                              | Completion flag                            |
| `action_items[].completed_at` | `v.optional(v.number())`                   | Completion timestamp (Unix ms)             |
| `sentiment`                   | `v.optional(opsCheckInSentimentValidator)` | Reviewer sentiment classification          |
| `next_review_date`            | `v.optional(v.number())`                   | Optional next review anchor date (Unix ms) |
| `created_at`                  | `v.number()`                               | Created timestamp (Unix ms)                |
| `updated_at`                  | `v.number()`                               | Last updated timestamp (Unix ms)           |
| `is_deleted`                  | `v.boolean()`                              | Soft-delete flag                           |

**Indexes**

- `by_agent` -> `agent_user_id, created_at`
- `by_reviewer` -> `reviewer_user_id, created_at`

**Search indexes**

- None

System fields `_id` and `_creationTime` are auto-managed by Convex.

### Phase 16 / Tenant Browse

#### Table: `tenant_favorites`

Stores canonical listing favorites for logged-in tenants. This table backs `/tenant/favorites` and replaces `tenant_profiles.saved_listings` as the primary favorite source.

| Field            | Validator                 | Description                                   |
| ---------------- | ------------------------- | --------------------------------------------- |
| `tenant_user_id` | `v.id("users")`           | Tenant user who favorited the listing         |
| `listing_id`     | `v.id("listings")`        | Favorited listing                             |
| `created_at`     | `v.number()`              | Favorite creation timestamp (Unix ms)         |
| `is_deleted`     | `v.optional(v.boolean())` | Optional soft-delete flag for unfavorite flow |

**Indexes**

- `by_tenant` -> `tenant_user_id`
- `by_tenant_and_listing` -> `tenant_user_id, listing_id`

**Search indexes**

- None

System fields `_id` and `_creationTime` are auto-managed by Convex.

---

## Table Groups by Phase

### Core Tables (P01-P29)

- `users`, `guard_profiles`, `tenant_profiles`, `roles`, `user_role_assignments`, `system_config`, `audit_logs`, `societies`, `buildings`, `leads`, `guard_shifts`, `owner_verifications`, `listings`, `listing_photos`, `listing_roommate_profiles`, `listing_commute_landmarks`, `listing_inquiries`, `tenant_inquiries`, `negotiations`, `negotiation_terms_proposals`, `negotiation_terms_signatures`, `negotiation_token_records`, `chat_channels`, `owner_invites`, `chat_messages`, `chat_message_batches`, `chat_read_receipts`, `deal_checklists`, `deal_checklist_signatures`, `visits`, `closures`, `payouts`, `quality_score_history`, `guard_streaks`, `payout_adjustments`, `incentive_cards`, `analytics_snapshots`, `support_inquiries`, `owner_service_requests`, `referral_codes`, `referrals`, `referral_milestones`, `referral_config`, `newsletter_subscriptions`

### Phase 30 - Field Operations

- `checklist_templates`, `checklist_instances`, `document_requirements`, `regulatory_items`

### Phase 31 - Owners and RM Foundation

- `owners`, `owner_rm_assignments`, `rm_check_ins`

### Phase 32 - Incentive V3

- `incentive_actor_profiles`, `deal_commission_evaluations`, `commission_modifier_templates`, `incentive_config_versions`, `shadow_mode_deltas`, `deal_contributions`, `attribution_records`, `attribution_splits`, `incentive_disbursements`, `gamification_profiles`, `gamification_quests`, `user_quest_progress`

### Phase 33 - Trust and Verification Display

- `listing_trust_badges`

### Phase 34 - Transaction Completion Rails

- `rental_transactions`, `rental_agreements`, `kyc_packets`, `token_bookings`, `deposit_records`, `handover_checklists`

### Phase 35 - Notification Infrastructure

- `notification_preferences`, `notification_templates`, `notification_events`, `notifications`, `push_subscriptions`

### Phase 36 - Monetization Foundation

- `transaction_fees`, `tenant_passes`, `partner_services`, `service_bundles`, `promoted_listings`, `revenue_line_items`

### Phase 16 - Tenant Browse

- `tenant_favorites`

### Phase 46 - CEO Ops Command Center

- `ops_kpi_targets`, `ops_warnings`, `ops_check_in_notes`

## Reconciliation Notes

- This document now mirrors `convex/schema.ts` 1:1.
