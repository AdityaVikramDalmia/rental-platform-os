export const SOCIETY_STATUS = {
  ONBOARDING: "ONBOARDING",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const satisfies Record<string, string>;

export type SocietyStatus = (typeof SOCIETY_STATUS)[keyof typeof SOCIETY_STATUS];

export const BUILDING_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const satisfies Record<string, string>;

export type BuildingStatus = (typeof BUILDING_STATUS)[keyof typeof BUILDING_STATUS];

export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  BANNED: "BANNED",
} as const satisfies Record<string, string>;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const LEAD_STATUS = {
  SUBMITTED: "SUBMITTED",
  NEED_INFO: "NEED_INFO",
  POTENTIAL_DUPLICATE: "POTENTIAL_DUPLICATE",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  DUPLICATE: "DUPLICATE",
} as const satisfies Record<string, string>;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const VISIT_STATUS = {
  ASSIGNED: "ASSIGNED",
  CONFIRMED: "CONFIRMED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const satisfies Record<string, string>;

export type VisitStatus = (typeof VISIT_STATUS)[keyof typeof VISIT_STATUS];

export const LISTING_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const satisfies Record<string, string>;

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

export const TRUST_BADGE_TYPE = {
  OWNER_VERIFIED: "OWNER_VERIFIED",
  PHYSICALLY_INSPECTED: "PHYSICALLY_INSPECTED",
  FRESH_LISTING: "FRESH_LISTING",
  REAL_PHOTOS: "REAL_PHOTOS",
  VISITS_COMPLETED: "VISITS_COMPLETED",
  CLOSURE_HISTORY: "CLOSURE_HISTORY",
} as const satisfies Record<string, string>;

export type TrustBadgeType = (typeof TRUST_BADGE_TYPE)[keyof typeof TRUST_BADGE_TYPE];

export const FRESHNESS_STATE = {
  FRESH: "FRESH",
  AGING: "AGING",
  STALE: "STALE",
} as const satisfies Record<string, string>;

export type FreshnessState = (typeof FRESHNESS_STATE)[keyof typeof FRESHNESS_STATE];

export const CLOSURE_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<string, string>;

export type ClosureStatus = (typeof CLOSURE_STATUS)[keyof typeof CLOSURE_STATUS];

export const PAYOUT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  DISBURSED: "disbursed",
  FAILED: "failed",
  VOIDED: "voided",
} as const satisfies Record<string, string>;

export type PayoutStatus = (typeof PAYOUT_STATUS)[keyof typeof PAYOUT_STATUS];

export const FEE_SLAB = {
  LT_20K: "LT_20K",
  BT_20K_40K: "BT_20K_40K",
  BT_40K_80K: "BT_40K_80K",
  GT_80K_CUSTOM: "GT_80K_CUSTOM",
} as const satisfies Record<string, string>;

export type FeeSlab = (typeof FEE_SLAB)[keyof typeof FEE_SLAB];

export const DEFAULT_FEE_SLABS = {
  LT_20K: { rent_min: 0, rent_max: 2000000, fee: 999900 },
  BT_20K_40K: { rent_min: 2000000, rent_max: 4000000, fee: 1499900 },
  BT_40K_80K: { rent_min: 4000000, rent_max: 8000000, fee: 2299900 },
  GT_80K_CUSTOM: { rent_min: 8000000, rent_max: null, fee: 0 },
} as const;

export const PASS_STATUS = {
  PURCHASED: "PURCHASED",
  ACTIVE: "ACTIVE",
  PARTIALLY_CONSUMED: "PARTIALLY_CONSUMED",
  CONSUMED: "CONSUMED",
  EXPIRED: "EXPIRED",
  REFUNDED: "REFUNDED",
  VOIDED: "VOIDED",
} as const satisfies Record<string, string>;

export type PassStatus = (typeof PASS_STATUS)[keyof typeof PASS_STATUS];

export const PASS_TYPE = {
  DISCOVERY_BASIC: "DISCOVERY_BASIC",
  DISCOVERY_PLUS: "DISCOVERY_PLUS",
  DISCOVERY_PREMIUM: "DISCOVERY_PREMIUM",
} as const satisfies Record<string, string>;

export type PassType = (typeof PASS_TYPE)[keyof typeof PASS_TYPE];

export const PROMOTION_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ENDED: "ENDED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<string, string>;

export type PromotionStatus = (typeof PROMOTION_STATUS)[keyof typeof PROMOTION_STATUS];

export const BUNDLE_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<string, string>;

export type BundleStatus = (typeof BUNDLE_STATUS)[keyof typeof BUNDLE_STATUS];

export const SERVICE_CATEGORY = {
  PACKERS_MOVERS: "PACKERS_MOVERS",
  CLEANING: "CLEANING",
  PAINTING: "PAINTING",
  PEST_CONTROL: "PEST_CONTROL",
  FURNITURE_RENTAL: "FURNITURE_RENTAL",
  OTHER: "OTHER",
} as const satisfies Record<string, string>;

export type ServiceCategory = (typeof SERVICE_CATEGORY)[keyof typeof SERVICE_CATEGORY];

export const REVENUE_LINE_TYPE = {
  FEE_GROSS: "FEE_GROSS",
  PASS_CREDIT: "PASS_CREDIT",
  FEE_NET: "FEE_NET",
  SERVICE_GROSS: "SERVICE_GROSS",
  PARTNER_COST: "PARTNER_COST",
  SERVICE_COMMISSION: "SERVICE_COMMISSION",
  PROMOTION_REVENUE: "PROMOTION_REVENUE",
  REFUND: "REFUND",
  ADJUSTMENT: "ADJUSTMENT",
} as const satisfies Record<string, string>;

export type RevenueLineType = (typeof REVENUE_LINE_TYPE)[keyof typeof REVENUE_LINE_TYPE];

export const COMMISSION_MODEL = {
  FIXED: "FIXED",
  PERCENTAGE: "PERCENTAGE",
} as const satisfies Record<string, string>;

export type CommissionModel = (typeof COMMISSION_MODEL)[keyof typeof COMMISSION_MODEL];

export const PASS_TRANSITIONS: Record<PassStatus, PassStatus[]> = {
  PURCHASED: [PASS_STATUS.ACTIVE, PASS_STATUS.VOIDED],
  ACTIVE: [
    PASS_STATUS.PARTIALLY_CONSUMED,
    PASS_STATUS.CONSUMED,
    PASS_STATUS.EXPIRED,
    PASS_STATUS.REFUNDED,
  ],
  PARTIALLY_CONSUMED: [PASS_STATUS.CONSUMED, PASS_STATUS.EXPIRED, PASS_STATUS.REFUNDED],
  CONSUMED: [],
  EXPIRED: [PASS_STATUS.REFUNDED],
  REFUNDED: [],
  VOIDED: [],
};

export const PROMOTION_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  PENDING_PAYMENT: [PROMOTION_STATUS.SCHEDULED, PROMOTION_STATUS.CANCELLED],
  SCHEDULED: [PROMOTION_STATUS.ACTIVE, PROMOTION_STATUS.CANCELLED],
  ACTIVE: [PROMOTION_STATUS.PAUSED, PROMOTION_STATUS.ENDED, PROMOTION_STATUS.CANCELLED],
  PAUSED: [PROMOTION_STATUS.ACTIVE, PROMOTION_STATUS.ENDED, PROMOTION_STATUS.CANCELLED],
  ENDED: [],
  CANCELLED: [],
};

export const BUNDLE_TRANSITIONS: Record<BundleStatus, BundleStatus[]> = {
  PENDING: [BUNDLE_STATUS.IN_PROGRESS, BUNDLE_STATUS.CANCELLED],
  IN_PROGRESS: [BUNDLE_STATUS.COMPLETED, BUNDLE_STATUS.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export const REFERRAL_TYPE = {
  TENANT_FINDING: "TENANT_FINDING",
  OWNER_FINDING: "OWNER_FINDING",
  GUARD: "GUARD",
} as const satisfies Record<string, string>;

export type ReferralType = (typeof REFERRAL_TYPE)[keyof typeof REFERRAL_TYPE];

export const REFERRAL_STATUS = {
  PENDING: "PENDING",
  QUALIFIED: "QUALIFIED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  FULLY_PAID: "FULLY_PAID",
  VOIDED: "VOIDED",
} as const satisfies Record<string, string>;

export type ReferralStatus = (typeof REFERRAL_STATUS)[keyof typeof REFERRAL_STATUS];

export const REFERRAL_MILESTONE_TYPE = {
  SIGN_UP: "SIGN_UP",
  LISTING_PUBLISHED: "LISTING_PUBLISHED",
  DEAL_CLOSED: "DEAL_CLOSED",
  FIRST_VERIFIED_LEAD: "FIRST_VERIFIED_LEAD",
} as const satisfies Record<string, string>;

export type ReferralMilestoneType =
  (typeof REFERRAL_MILESTONE_TYPE)[keyof typeof REFERRAL_MILESTONE_TYPE];

export const REFERRAL_MILESTONE_STATUS = {
  PENDING: "PENDING",
  TRIGGERED: "TRIGGERED",
  APPROVED: "APPROVED",
  PAID: "PAID",
  VOIDED: "VOIDED",
} as const satisfies Record<string, string>;

export type ReferralMilestoneStatus =
  (typeof REFERRAL_MILESTONE_STATUS)[keyof typeof REFERRAL_MILESTONE_STATUS];

export const REFERRAL_CONFIG_SCOPE_TYPE = {
  GLOBAL: "GLOBAL",
  SOCIETY: "SOCIETY",
  BUILDING: "BUILDING",
} as const satisfies Record<string, string>;

export type ReferralConfigScopeType =
  (typeof REFERRAL_CONFIG_SCOPE_TYPE)[keyof typeof REFERRAL_CONFIG_SCOPE_TYPE];

export const REFERRAL_TYPE_LABELS: Record<ReferralType, string> = {
  [REFERRAL_TYPE.TENANT_FINDING]: "Tenant Finding",
  [REFERRAL_TYPE.OWNER_FINDING]: "Owner Finding",
  [REFERRAL_TYPE.GUARD]: "Guard",
};

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  [REFERRAL_STATUS.PENDING]: "Pending",
  [REFERRAL_STATUS.QUALIFIED]: "Qualified",
  [REFERRAL_STATUS.PARTIALLY_PAID]: "Partially Paid",
  [REFERRAL_STATUS.FULLY_PAID]: "Fully Paid",
  [REFERRAL_STATUS.VOIDED]: "Voided",
};

export const REFERRAL_MILESTONE_STATUS_LABELS: Record<ReferralMilestoneStatus, string> = {
  [REFERRAL_MILESTONE_STATUS.PENDING]: "Pending",
  [REFERRAL_MILESTONE_STATUS.TRIGGERED]: "Triggered",
  [REFERRAL_MILESTONE_STATUS.APPROVED]: "Approved",
  [REFERRAL_MILESTONE_STATUS.PAID]: "Paid",
  [REFERRAL_MILESTONE_STATUS.VOIDED]: "Voided",
};

export const CALL_OUTCOME = {
  VERIFIED: "VERIFIED",
  UNREACHABLE: "UNREACHABLE",
  DECLINED: "DECLINED",
  FALSE: "FALSE",
} as const satisfies Record<string, string>;

export type CallOutcome = (typeof CALL_OUTCOME)[keyof typeof CALL_OUTCOME];

export const USER_TYPE = {
  GUARD: "GUARD",
  ADMIN: "ADMIN",
  OPS: "OPS",
  TENANT: "TENANT",
  OWNER: "OWNER",
} as const satisfies Record<string, string>;

export type UserType = (typeof USER_TYPE)[keyof typeof USER_TYPE];

export const PORTAL_ROOT: Record<UserType, string> = {
  [USER_TYPE.GUARD]: "/guard/dashboard",
  [USER_TYPE.ADMIN]: "/admin/dashboard",
  [USER_TYPE.OPS]: "/ops/dashboard",
  [USER_TYPE.OWNER]: "/owner/dashboard",
  [USER_TYPE.TENANT]: "/tenant/dashboard",
};

export function getPortalRoot(persona: UserType): string {
  return PORTAL_ROOT[persona] ?? "/";
}

export const PERSONA_DISPLAY_CONFIG: Record<
  UserType,
  { label: string; description: string; iconName: string }
> = {
  [USER_TYPE.GUARD]: {
    label: "Security Guard",
    description: "Submit leads and earn bounties",
    iconName: "Shield",
  },
  [USER_TYPE.ADMIN]: {
    label: "Admin",
    description: "Manage the platform",
    iconName: "Settings",
  },
  [USER_TYPE.OPS]: {
    label: "Field Ops",
    description: "Manage visits and closures",
    iconName: "Briefcase",
  },
  [USER_TYPE.OWNER]: {
    label: "Property Owner",
    description: "Manage your properties",
    iconName: "Home",
  },
  [USER_TYPE.TENANT]: {
    label: "Tenant",
    description: "Browse and inquire about listings",
    iconName: "Search",
  },
};

export const FIELD_WORKER_USER_TYPES = [USER_TYPE.GUARD, USER_TYPE.OPS] as const;
export type FieldWorkerUserType = (typeof FIELD_WORKER_USER_TYPES)[number];

export function isFieldWorkerUserType(
  userType: string | undefined,
): userType is FieldWorkerUserType {
  return FIELD_WORKER_USER_TYPES.some((fieldWorkerType) => fieldWorkerType === userType);
}

export const NOTIFICATION_CHANNEL = {
  IN_APP: "IN_APP",
  PUSH: "PUSH",
  WHATSAPP: "WHATSAPP",
  SMS: "SMS",
  EMAIL: "EMAIL",
} as const satisfies Record<string, string>;

export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];

export const NOTIFICATION_CATEGORY = {
  LEAD_UPDATE: "LEAD_UPDATE",
  VISIT_UPDATE: "VISIT_UPDATE",
  PAYOUT_UPDATE: "PAYOUT_UPDATE",
  INQUIRY_UPDATE: "INQUIRY_UPDATE",
  AGREEMENT_STATUS: "AGREEMENT_STATUS",
  MOVE_IN_REMINDER: "MOVE_IN_REMINDER",
  MAINTENANCE_UPDATE: "MAINTENANCE_UPDATE",
  SYSTEM_ALERT: "SYSTEM_ALERT",
} as const satisfies Record<string, string>;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY];

export const NOTIFICATION_SEVERITY = {
  NORMAL: "NORMAL",
  IMPORTANT: "IMPORTANT",
  URGENT: "URGENT",
} as const satisfies Record<string, string>;

export type NotificationSeverity =
  (typeof NOTIFICATION_SEVERITY)[keyof typeof NOTIFICATION_SEVERITY];

export const NOTIFICATION_EVENT_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
  DEAD_LETTER: "DEAD_LETTER",
  SUPPRESSED: "SUPPRESSED",
} as const satisfies Record<string, string>;

export type NotificationEventStatus =
  (typeof NOTIFICATION_EVENT_STATUS)[keyof typeof NOTIFICATION_EVENT_STATUS];

export const PERSONA_CHANNEL_PRIORITY: Record<UserType, readonly NotificationChannel[]> = {
  [USER_TYPE.GUARD]: [
    NOTIFICATION_CHANNEL.WHATSAPP,
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.SMS,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  [USER_TYPE.ADMIN]: [NOTIFICATION_CHANNEL.IN_APP],
  [USER_TYPE.OPS]: [NOTIFICATION_CHANNEL.IN_APP],
  [USER_TYPE.TENANT]: [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.IN_APP,
    NOTIFICATION_CHANNEL.WHATSAPP,
    NOTIFICATION_CHANNEL.SMS,
  ],
  [USER_TYPE.OWNER]: [
    NOTIFICATION_CHANNEL.WHATSAPP,
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.SMS,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
};

export const NOTIFICATION_CHANNEL_THROTTLE_CAPS: Record<
  Exclude<NotificationChannel, "IN_APP">,
  number
> = {
  [NOTIFICATION_CHANNEL.PUSH]: 5,
  [NOTIFICATION_CHANNEL.WHATSAPP]: 3,
  [NOTIFICATION_CHANNEL.SMS]: 1,
  [NOTIFICATION_CHANNEL.EMAIL]: 3,
};

export const BACKOFFICE_USER_TYPES: readonly string[] = [USER_TYPE.ADMIN, USER_TYPE.OPS] as const;

export function isBackofficeUser(userType: string | undefined): boolean {
  return userType === USER_TYPE.ADMIN || userType === USER_TYPE.OPS;
}

export const OWNER_LIFECYCLE_STAGE = {
  PROSPECT: "PROSPECT",
  VERIFIED: "VERIFIED",
  ACTIVE: "ACTIVE",
  MANAGED: "MANAGED",
  DORMANT: "DORMANT",
  CHURNED: "CHURNED",
} as const satisfies Record<string, string>;

export type OwnerLifecycleStage =
  (typeof OWNER_LIFECYCLE_STAGE)[keyof typeof OWNER_LIFECYCLE_STAGE];

export const OWNER_SOURCE = {
  GUARD_LEAD: "GUARD_LEAD",
  OWNER_SERVICE_REQUEST: "OWNER_SERVICE_REQUEST",
  OPS_CREATED: "OPS_CREATED",
} as const satisfies Record<string, string>;

export type OwnerSource = (typeof OWNER_SOURCE)[keyof typeof OWNER_SOURCE];

export const OWNER_LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  PROSPECT: ["VERIFIED", "CHURNED"],
  VERIFIED: ["ACTIVE", "CHURNED"],
  ACTIVE: ["MANAGED", "CHURNED"],
  MANAGED: ["DORMANT", "CHURNED"],
  DORMANT: ["ACTIVE", "CHURNED"],
  CHURNED: [],
};

export const OWNER_LIFECYCLE_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  VERIFIED: "Verified",
  ACTIVE: "Active",
  MANAGED: "Managed",
  DORMANT: "Dormant",
  CHURNED: "Churned",
};

export const RM_ASSIGNMENT_STATUS = {
  ACTIVE: "ACTIVE",
  WARNING: "WARNING",
  ESCALATED: "ESCALATED",
  REASSIGNED: "REASSIGNED",
  ENDED: "ENDED",
} as const satisfies Record<string, string>;

export type RmAssignmentStatus = (typeof RM_ASSIGNMENT_STATUS)[keyof typeof RM_ASSIGNMENT_STATUS];

export const RM_CHECK_IN_TYPE = {
  SCHEDULED: "SCHEDULED",
  ISSUE: "ISSUE",
  RE_LISTING: "RE_LISTING",
  OWNER_INITIATED: "OWNER_INITIATED",
  AD_HOC: "AD_HOC",
} as const satisfies Record<string, string>;

export type RmCheckInType = (typeof RM_CHECK_IN_TYPE)[keyof typeof RM_CHECK_IN_TYPE];

export const RM_CHECK_IN_METHOD = {
  CALL: "CALL",
  WHATSAPP: "WHATSAPP",
  IN_PERSON: "IN_PERSON",
  OTHER: "OTHER",
} as const satisfies Record<string, string>;

export type RmCheckInMethod = (typeof RM_CHECK_IN_METHOD)[keyof typeof RM_CHECK_IN_METHOD];

export const RM_CHECK_IN_OUTCOME = {
  RESOLVED: "RESOLVED",
  PENDING: "PENDING",
  ESCALATED: "ESCALATED",
} as const satisfies Record<string, string>;

export type RmCheckInOutcome = (typeof RM_CHECK_IN_OUTCOME)[keyof typeof RM_CHECK_IN_OUTCOME];

export const RM_ASSIGNED_BY = {
  SYSTEM: "SYSTEM",
  ADMIN: "ADMIN",
} as const satisfies Record<string, string>;

export type RmAssignedBy = (typeof RM_ASSIGNED_BY)[keyof typeof RM_ASSIGNED_BY];

export const RM_STATUS_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["WARNING", "ESCALATED", "REASSIGNED", "ENDED"],
  WARNING: ["ACTIVE", "ESCALATED", "REASSIGNED"],
  ESCALATED: ["ACTIVE", "REASSIGNED", "ENDED"],
  REASSIGNED: [],
  ENDED: [],
};

export const RM_ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  WARNING: "Warning",
  ESCALATED: "Escalated",
  REASSIGNED: "Reassigned",
  ENDED: "Ended",
};

export const OPS_EMAIL_DOMAIN = "@ops.local";

export const GUARD_TYPE = {
  BUILDING_SPECIFIC: "BUILDING_SPECIFIC",
  MAIN_GATE: "MAIN_GATE",
  PARK: "PARK",
  ROVING: "ROVING",
  SOCIETY_GUARD: "SOCIETY_GUARD",
} as const satisfies Record<string, string>;

export type GuardType = (typeof GUARD_TYPE)[keyof typeof GUARD_TYPE];

export const GUARD_TYPE_LABELS: Record<GuardType, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "Building Guard",
  [GUARD_TYPE.MAIN_GATE]: "Main Gate Guard",
  [GUARD_TYPE.PARK]: "Park Guard",
  [GUARD_TYPE.ROVING]: "Roving Guard",
  [GUARD_TYPE.SOCIETY_GUARD]: "Society Guard",
};

export const SHIFT_TYPE = {
  RECURRING: "RECURRING",
  OVERRIDE: "OVERRIDE",
} as const satisfies Record<string, string>;

export type ShiftType = (typeof SHIFT_TYPE)[keyof typeof SHIFT_TYPE];

export const LOCATION_TYPE = {
  BUILDING: "BUILDING",
  MAIN_GATE: "MAIN_GATE",
  PARK: "PARK",
  PARKING: "PARKING",
  OTHER: "OTHER",
} as const satisfies Record<string, string>;

export type LocationType = (typeof LOCATION_TYPE)[keyof typeof LOCATION_TYPE];

export const AVAILABILITY_TYPE = {
  VACANT_NOW: "VACANT_NOW",
  VACANT_FROM: "VACANT_FROM",
} as const satisfies Record<string, string>;

export type AvailabilityType = (typeof AVAILABILITY_TYPE)[keyof typeof AVAILABILITY_TYPE];

export const FURNISHING = {
  UNFURNISHED: "UNFURNISHED",
  SEMI_FURNISHED: "SEMI_FURNISHED",
  FULLY_FURNISHED: "FULLY_FURNISHED",
} as const satisfies Record<string, string>;

export type Furnishing = (typeof FURNISHING)[keyof typeof FURNISHING];

export const BHK_CONFIG = {
  "1BHK": "1BHK",
  "2BHK": "2BHK",
  "3BHK": "3BHK",
  "4BHK": "4BHK",
  STUDIO: "STUDIO",
  OTHER: "OTHER",
} as const satisfies Record<string, string>;

export type BhkConfig = (typeof BHK_CONFIG)[keyof typeof BHK_CONFIG];

export const PARKING = {
  NONE: "NONE",
  COVERED: "COVERED",
  OPEN: "OPEN",
  BOTH: "BOTH",
} as const satisfies Record<string, string>;

export type Parking = (typeof PARKING)[keyof typeof PARKING];

export const PAYOUT_METHOD = {
  CASH: "CASH",
  UPI: "UPI",
  BANK_TRANSFER: "BANK_TRANSFER",
} as const satisfies Record<string, string>;

export type PayoutMethod = (typeof PAYOUT_METHOD)[keyof typeof PAYOUT_METHOD];

export const INCENTIVE_CARD_TYPE = {
  LEAD_MILESTONE: "lead_milestone",
  VISIT_MILESTONE: "visit_milestone",
  QUALITY_STREAK: "quality_streak",
  SPEED_BONUS: "speed_bonus",
  MONTHLY_TOP: "monthly_top",
} as const satisfies Record<string, string>;

export type IncentiveCardType = (typeof INCENTIVE_CARD_TYPE)[keyof typeof INCENTIVE_CARD_TYPE];

export const INCENTIVE_LEVEL = {
  BRONZE: "BRONZE",
  SILVER: "SILVER",
  GOLD: "GOLD",
  PLATINUM: "PLATINUM",
} as const satisfies Record<string, string>;

export type IncentiveLevel = (typeof INCENTIVE_LEVEL)[keyof typeof INCENTIVE_LEVEL];

export const QUALITY_TIER = {
  BRONZE: "BRONZE",
  SILVER: "SILVER",
  GOLD: "GOLD",
  PLATINUM: "PLATINUM",
} as const satisfies Record<string, string>;

export type QualityTier = (typeof QUALITY_TIER)[keyof typeof QUALITY_TIER];

export const QUALITY_TIER_LABELS: Record<QualityTier, string> = {
  [QUALITY_TIER.BRONZE]: "Bronze",
  [QUALITY_TIER.SILVER]: "Silver",
  [QUALITY_TIER.GOLD]: "Gold",
  [QUALITY_TIER.PLATINUM]: "Platinum",
};

export const STREAK_TYPE = {
  DAILY_ACTIVE: "DAILY_ACTIVE",
  WEEKLY_WARRIOR: "WEEKLY_WARRIOR",
  QUALITY_CHAIN: "QUALITY_CHAIN",
  PERFECT_10: "PERFECT_10",
} as const satisfies Record<string, string>;

export type StreakType = (typeof STREAK_TYPE)[keyof typeof STREAK_TYPE];

export const STREAK_TYPE_LABELS: Record<StreakType, string> = {
  [STREAK_TYPE.DAILY_ACTIVE]: "Daily Active",
  [STREAK_TYPE.WEEKLY_WARRIOR]: "Weekly Warrior",
  [STREAK_TYPE.QUALITY_CHAIN]: "Quality Chain",
  [STREAK_TYPE.PERFECT_10]: "Perfect 10",
};

export const PENALTY_TYPE = {
  LOW_COMPLETENESS: "LOW_COMPLETENESS",
  MISSING_PHOTOS: "MISSING_PHOTOS",
  FALSE_LEAD: "FALSE_LEAD",
  NO_SHOW: "NO_SHOW",
  CONSECUTIVE_POOR: "CONSECUTIVE_POOR",
} as const satisfies Record<string, string>;

export type PenaltyType = (typeof PENALTY_TYPE)[keyof typeof PENALTY_TYPE];

export const PENALTY_TYPE_LABELS: Record<PenaltyType, string> = {
  [PENALTY_TYPE.LOW_COMPLETENESS]: "Low Completeness",
  [PENALTY_TYPE.MISSING_PHOTOS]: "Missing Photos",
  [PENALTY_TYPE.FALSE_LEAD]: "False Lead",
  [PENALTY_TYPE.NO_SHOW]: "No Show",
  [PENALTY_TYPE.CONSECUTIVE_POOR]: "Consecutive Poor Quality",
};

export const BONUS_TYPE = {
  FULL_CHECKLIST: "FULL_CHECKLIST",
  ALL_GPS_PHOTOS: "ALL_GPS_PHOTOS",
  WITHIN_SLA: "WITHIN_SLA",
  ALL_REQUIRED_DOCS: "ALL_REQUIRED_DOCS",
  STREAK_MILESTONE: "STREAK_MILESTONE",
} as const satisfies Record<string, string>;

export type BonusType = (typeof BONUS_TYPE)[keyof typeof BONUS_TYPE];

export const BONUS_TYPE_LABELS: Record<BonusType, string> = {
  [BONUS_TYPE.FULL_CHECKLIST]: "Full Checklist",
  [BONUS_TYPE.ALL_GPS_PHOTOS]: "All GPS Photos",
  [BONUS_TYPE.WITHIN_SLA]: "Within SLA",
  [BONUS_TYPE.ALL_REQUIRED_DOCS]: "All Required Docs",
  [BONUS_TYPE.STREAK_MILESTONE]: "Streak Milestone",
};

export const INCENTIVE_AWARD_METHOD = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
} as const satisfies Record<string, string>;

export type IncentiveAwardMethod =
  (typeof INCENTIVE_AWARD_METHOD)[keyof typeof INCENTIVE_AWARD_METHOD];

export const INCENTIVE_CARD_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  REDEEMED: "redeemed",
} as const satisfies Record<string, string>;

export type IncentiveCardStatus =
  (typeof INCENTIVE_CARD_STATUS)[keyof typeof INCENTIVE_CARD_STATUS];

// ============ Incentive v3 ============

export const INCENTIVE_PERSONA = {
  GUARD: "GUARD",
  OPS: "OPS",
  SALES: "SALES",
  RM: "RM",
  LIAISON: "LIAISON",
  ALL: "ALL",
} as const satisfies Record<string, string>;

export type IncentivePersona = (typeof INCENTIVE_PERSONA)[keyof typeof INCENTIVE_PERSONA];

export const CONTRIBUTION_STAGE = {
  DISCOVERY: "DISCOVERY",
  VERIFICATION: "VERIFICATION",
  CLOSURE: "CLOSURE",
  SUPPORT: "SUPPORT",
} as const satisfies Record<string, string>;

export type ContributionStage = (typeof CONTRIBUTION_STAGE)[keyof typeof CONTRIBUTION_STAGE];

export const ATTRIBUTION_ALGORITHM = {
  STAGE_WEIGHTED_QUALITY: "STAGE_WEIGHTED_QUALITY",
  EQUAL_SPLIT: "EQUAL_SPLIT",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
} as const satisfies Record<string, string>;

export type AttributionAlgorithm =
  (typeof ATTRIBUTION_ALGORITHM)[keyof typeof ATTRIBUTION_ALGORITHM];

export const CONTRIBUTION_SOURCE_ENTITY = {
  LEAD: "LEAD",
  VISIT: "VISIT",
  CLOSURE: "CLOSURE",
  AUDIT_LOG: "AUDIT_LOG",
  MANUAL: "MANUAL",
} as const satisfies Record<string, string>;

export type ContributionSourceEntity =
  (typeof CONTRIBUTION_SOURCE_ENTITY)[keyof typeof CONTRIBUTION_SOURCE_ENTITY];

export const CONFIG_VERSION_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const satisfies Record<string, string>;

export type ConfigVersionStatus =
  (typeof CONFIG_VERSION_STATUS)[keyof typeof CONFIG_VERSION_STATUS];

export const ATTRIBUTION_STATUS = {
  PROVISIONAL: "PROVISIONAL",
  FINAL: "FINAL",
  DISPUTED: "DISPUTED",
  RESOLVED: "RESOLVED",
} as const satisfies Record<string, string>;

export type AttributionStatus = (typeof ATTRIBUTION_STATUS)[keyof typeof ATTRIBUTION_STATUS];

export const DISBURSEMENT_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  DISBURSED: "DISBURSED",
  FAILED: "FAILED",
  VOIDED: "VOIDED",
} as const satisfies Record<string, string>;

export type DisbursementStatus = (typeof DISBURSEMENT_STATUS)[keyof typeof DISBURSEMENT_STATUS];

export const DISBURSEMENT_SOURCE_TYPE = {
  ATTRIBUTION_SPLIT: "ATTRIBUTION_SPLIT",
  QUEST_REWARD: "QUEST_REWARD",
  TEAM_POOL: "TEAM_POOL",
  V2_MIGRATION: "V2_MIGRATION",
} as const satisfies Record<string, string>;

export type DisbursementSourceType =
  (typeof DISBURSEMENT_SOURCE_TYPE)[keyof typeof DISBURSEMENT_SOURCE_TYPE];

export const MODIFIER_REWARD_MODE = {
  BPS: "BPS",
  FLAT_PAISE: "FLAT_PAISE",
} as const satisfies Record<string, string>;

export type ModifierRewardMode = (typeof MODIFIER_REWARD_MODE)[keyof typeof MODIFIER_REWARD_MODE];

export const MODIFIER_LINK_MODE = {
  INDIVIDUAL: "INDIVIDUAL",
  AND_GROUP: "AND_GROUP",
  OR_GROUP: "OR_GROUP",
} as const satisfies Record<string, string>;

export type ModifierLinkMode = (typeof MODIFIER_LINK_MODE)[keyof typeof MODIFIER_LINK_MODE];

export const MODIFIER_RULE_TYPE = {
  THRESHOLD_STEP: "threshold_step",
  LINEAR_BAND: "linear_band",
  PENALTY_STEP: "penalty_step",
} as const;
export type ModifierRuleType = (typeof MODIFIER_RULE_TYPE)[keyof typeof MODIFIER_RULE_TYPE];

export const COMMISSION_METRIC_SOURCE = {
  AVG_DOC_PROCESSING_HOURS: "avg_doc_processing_hours",
  ON_TIME_VISIT_RATE: "on_time_visit_rate",
  AVG_CHECKLIST_SCORE: "avg_checklist_score",
  RESPONSE_SPEED_HOURS: "response_speed_hours",
  COMPLETION_RATE: "completion_rate",
  PENALTY_COUNT: "penalty_count",
  CUSTOM: "custom",
} as const;
export type CommissionMetricSource =
  (typeof COMMISSION_METRIC_SOURCE)[keyof typeof COMMISSION_METRIC_SOURCE];

export const COMMISSION_EVAL_STATUS = {
  DRAFT: "DRAFT",
  FINAL: "FINAL",
  VOIDED: "VOIDED",
} as const;
export type CommissionEvalStatus =
  (typeof COMMISSION_EVAL_STATUS)[keyof typeof COMMISSION_EVAL_STATUS];

export const COMMISSION_BOUNDS = {
  DEFAULT_BASE_BPS: 1500,
  DEFAULT_MIN_BPS: 1500,
  DEFAULT_MAX_BPS: 2200,
} as const;

export const ATTRIBUTION_STAGE_WEIGHTS = {
  DISCOVERY: 25,
  VERIFICATION: 35,
  CLOSURE: 25,
  SUPPORT: 15,
} as const;

export const WEEKLY_TIER = {
  BRONZE: "BRONZE",
  SILVER: "SILVER",
  GOLD: "GOLD",
  PLATINUM: "PLATINUM",
} as const;

export const WEEKLY_TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 200,
  GOLD: 500,
  PLATINUM: 1000,
} as const;

export const QUEST_REWARD_TYPE = {
  XP: "XP",
  PAISE: "PAISE",
  PERK: "PERK",
} as const;

export const QUEST_SCOPE = {
  INDIVIDUAL: "INDIVIDUAL",
  TEAM: "TEAM",
} as const;

export const XP_AWARDS = {
  LEAD_VERIFIED: 50,
  LEAD_VERIFIED_HIGH_QUALITY: 50,
  LEAD_VERIFIED_LOW_QUALITY: 25,
  VISIT_COMPLETED: 75,
  VISIT_COMPLETED_HIGH_CHECKLIST: 100,
  CLOSURE_COMPLETED: 200,
  DOCUMENT_ON_TIME: 30,
  DOCUMENT_LATE: 15,
  DAILY_CHECKLIST_COMPLETE: 50,
  PERFECT_WEEK: 300,
} as const;

export const STREAK_MILESTONES = {
  7: { xp: 100, badge: "WEEK_WARRIOR" },
  14: { xp: 250, badge: null },
  30: { xp: 500, badge: "MONTHLY_CHAMPION" },
  60: { xp: 1000, badge: "DEDICATION" },
  100: { xp: 2000, badge: "CENTURY" },
  365: { xp: 0, badge: "YEAR_OF_EXCELLENCE" },
} as const;

export const BADGE_CODE_V3 = {
  FIRST_CLOSURE: "FIRST_CLOSURE",
  SPEED_DEMON: "SPEED_DEMON",
  DOCUMENT_MASTER: "DOCUMENT_MASTER",
  PERFECT_WEEK: "PERFECT_WEEK",
  DIAMOND_ACHIEVER: "DIAMOND_ACHIEVER",
  CENTURY_STREAK: "CENTURY_STREAK",
  QUALITY_KING: "QUALITY_KING",
  TEAM_PLAYER: "TEAM_PLAYER",
  WEEK_WARRIOR: "WEEK_WARRIOR",
  MONTHLY_CHAMPION: "MONTHLY_CHAMPION",
  DEDICATION: "DEDICATION",
  YEAR_OF_EXCELLENCE: "YEAR_OF_EXCELLENCE",
  EXPERIENCED: "EXPERIENCED",
  VETERAN: "VETERAN",
  ELITE: "ELITE",
  LEGEND: "LEGEND",
} as const;

export const INQUIRY_SOURCE = {
  CONTACT_FORM: "CONTACT_FORM",
  WHATSAPP_CLICK: "WHATSAPP_CLICK",
} as const satisfies Record<string, string>;

export type InquirySource = (typeof INQUIRY_SOURCE)[keyof typeof INQUIRY_SOURCE];

export const TENANT_INQUIRY_STATUS = {
  SUBMITTED: "SUBMITTED",
  REVIEWED: "REVIEWED",
  BOUNTY_POSTED: "BOUNTY_POSTED",
  GUARD_ACCEPTED: "GUARD_ACCEPTED",
  VISIT_SCHEDULED: "VISIT_SCHEDULED",
  VISIT_COMPLETED: "VISIT_COMPLETED",
  NEGOTIATION_INITIATED: "NEGOTIATION_INITIATED",
  CLOSED: "CLOSED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
} as const satisfies Record<string, string>;

export type TenantInquiryStatus =
  (typeof TENANT_INQUIRY_STATUS)[keyof typeof TENANT_INQUIRY_STATUS];

export const NEGOTIATION_STATUS = {
  INITIATED: "INITIATED",
  ACTIVE: "ACTIVE",
  TERMS_PROPOSED: "TERMS_PROPOSED",
  COUNTER_PROPOSED: "COUNTER_PROPOSED",
  TERMS_AGREED: "TERMS_AGREED",
  TOKEN_COLLECTED: "TOKEN_COLLECTED",
  DOCUMENTATION_IN_PROGRESS: "DOCUMENTATION_IN_PROGRESS",
  READY_FOR_CLOSURE: "READY_FOR_CLOSURE",
  CLOSED: "CLOSED",
  FAILED: "FAILED",
  STALLED: "STALLED",
  EXPIRED: "EXPIRED",
} as const satisfies Record<string, string>;

export type NegotiationStatus = (typeof NEGOTIATION_STATUS)[keyof typeof NEGOTIATION_STATUS];

export const NEGOTIATION_ROOM_TYPE = {
  OPS_TENANT: "OPS_TENANT",
  OPS_OWNER: "OPS_OWNER",
  COMBINED: "COMBINED",
} as const satisfies Record<string, string>;

export type NegotiationRoomType =
  (typeof NEGOTIATION_ROOM_TYPE)[keyof typeof NEGOTIATION_ROOM_TYPE];

export const NEGOTIATION_PROPOSAL_STATUS = {
  DRAFT: "DRAFT",
  SHARED: "SHARED",
  BOTH_AGREED: "BOTH_AGREED",
  SUPERSEDED: "SUPERSEDED",
} as const satisfies Record<string, string>;

export type NegotiationProposalStatus =
  (typeof NEGOTIATION_PROPOSAL_STATUS)[keyof typeof NEGOTIATION_PROPOSAL_STATUS];

export const TOKEN_REFUND_POLICY = {
  NON_REFUNDABLE: "NON_REFUNDABLE",
  REFUNDABLE_WITHIN_DAYS: "REFUNDABLE_WITHIN_DAYS",
  PARTIAL_REFUND: "PARTIAL_REFUND",
  CASE_BY_CASE: "CASE_BY_CASE",
} as const satisfies Record<string, string>;

export type TokenRefundPolicy = (typeof TOKEN_REFUND_POLICY)[keyof typeof TOKEN_REFUND_POLICY];

export const TOKEN_COLLECTION_METHOD = {
  CASH: "CASH",
  UPI: "UPI",
  BANK_TRANSFER: "BANK_TRANSFER",
  CHEQUE: "CHEQUE",
} as const satisfies Record<string, string>;

export type TokenCollectionMethod =
  (typeof TOKEN_COLLECTION_METHOD)[keyof typeof TOKEN_COLLECTION_METHOD];

export const TOKEN_RECORD_STATUS = {
  PENDING: "PENDING",
  COLLECTED: "COLLECTED",
  REFUNDED: "REFUNDED",
  FORFEITED: "FORFEITED",
  DISPUTED: "DISPUTED",
} as const satisfies Record<string, string>;

export type TokenRecordStatus = (typeof TOKEN_RECORD_STATUS)[keyof typeof TOKEN_RECORD_STATUS];

export const NEGOTIATION_CHECKLIST_ITEM_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  OBTAINED: "OBTAINED",
  VERIFIED: "VERIFIED",
  STAMP_REGISTERED: "STAMP_REGISTERED",
  DRAFT_READY: "DRAFT_READY",
  WAIVED: "WAIVED",
} as const satisfies Record<string, string>;

export type NegotiationChecklistItemStatus =
  (typeof NEGOTIATION_CHECKLIST_ITEM_STATUS)[keyof typeof NEGOTIATION_CHECKLIST_ITEM_STATUS];

export const MAINTENANCE_PAID_BY = {
  TENANT: "TENANT",
  OWNER: "OWNER",
  SPLIT: "SPLIT",
} as const satisfies Record<string, string>;

export type MaintenancePaidBy = (typeof MAINTENANCE_PAID_BY)[keyof typeof MAINTENANCE_PAID_BY];

export const RENT_ESCALATION_TYPE = {
  PERCENTAGE: "PERCENTAGE",
  FIXED_AMOUNT: "FIXED_AMOUNT",
  NONE: "NONE",
} as const satisfies Record<string, string>;

export type RentEscalationType = (typeof RENT_ESCALATION_TYPE)[keyof typeof RENT_ESCALATION_TYPE];

export const TRANSACTION_STATUS = {
  INITIATED: "INITIATED",
  KYC_PENDING: "KYC_PENDING",
  KYC_VERIFIED: "KYC_VERIFIED",
  KYC_REJECTED: "KYC_REJECTED",
  AGREEMENT_PENDING: "AGREEMENT_PENDING",
  AGREEMENT_SENT: "AGREEMENT_SENT",
  AGREEMENT_SIGNED: "AGREEMENT_SIGNED",
  TOKEN_PENDING: "TOKEN_PENDING",
  TOKEN_RECEIVED: "TOKEN_RECEIVED",
  DEPOSIT_PENDING: "DEPOSIT_PENDING",
  DEPOSIT_RECEIVED: "DEPOSIT_RECEIVED",
  MOVE_IN_SCHEDULED: "MOVE_IN_SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<string, string>;

export type TransactionStatus = (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];

export const KYC_PACKET_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const satisfies Record<string, string>;

export type KycPacketStatus = (typeof KYC_PACKET_STATUS)[keyof typeof KYC_PACKET_STATUS];

export const AGREEMENT_STATUS = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  PARTIALLY_SIGNED: "PARTIALLY_SIGNED",
  SIGNED: "SIGNED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<string, string>;

export type AgreementStatus = (typeof AGREEMENT_STATUS)[keyof typeof AGREEMENT_STATUS];

export const TOKEN_BOOKING_STATUS = {
  PENDING: "PENDING",
  RECORDED: "RECORDED",
  CONFIRMED: "CONFIRMED",
  DISPUTED: "DISPUTED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<string, string>;

export type TokenBookingStatus = (typeof TOKEN_BOOKING_STATUS)[keyof typeof TOKEN_BOOKING_STATUS];

export const DEPOSIT_RECORD_STATUS = {
  PENDING: "PENDING",
  RECORDED: "RECORDED",
  CONFIRMED: "CONFIRMED",
  DISPUTED: "DISPUTED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<string, string>;

export type DepositRecordStatus =
  (typeof DEPOSIT_RECORD_STATUS)[keyof typeof DEPOSIT_RECORD_STATUS];

export const POLICE_VERIFICATION_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  FORM_GENERATED: "FORM_GENERATED",
  SUBMITTED: "SUBMITTED",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const satisfies Record<string, string>;

export type PoliceVerificationStatus =
  (typeof POLICE_VERIFICATION_STATUS)[keyof typeof POLICE_VERIFICATION_STATUS];

export const VALID_TRANSACTION_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  [TRANSACTION_STATUS.INITIATED]: [TRANSACTION_STATUS.KYC_PENDING, TRANSACTION_STATUS.CANCELLED],
  [TRANSACTION_STATUS.KYC_PENDING]: [
    TRANSACTION_STATUS.KYC_VERIFIED,
    TRANSACTION_STATUS.KYC_REJECTED,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.KYC_VERIFIED]: [
    TRANSACTION_STATUS.AGREEMENT_PENDING,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.KYC_REJECTED]: [TRANSACTION_STATUS.KYC_PENDING, TRANSACTION_STATUS.CANCELLED],
  [TRANSACTION_STATUS.AGREEMENT_PENDING]: [
    TRANSACTION_STATUS.AGREEMENT_SENT,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.AGREEMENT_SENT]: [
    TRANSACTION_STATUS.AGREEMENT_SIGNED,
    TRANSACTION_STATUS.AGREEMENT_PENDING,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.AGREEMENT_SIGNED]: [
    TRANSACTION_STATUS.TOKEN_PENDING,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.TOKEN_PENDING]: [
    TRANSACTION_STATUS.TOKEN_RECEIVED,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.TOKEN_RECEIVED]: [
    TRANSACTION_STATUS.DEPOSIT_PENDING,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.DEPOSIT_PENDING]: [
    TRANSACTION_STATUS.DEPOSIT_RECEIVED,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.DEPOSIT_RECEIVED]: [
    TRANSACTION_STATUS.MOVE_IN_SCHEDULED,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.MOVE_IN_SCHEDULED]: [
    TRANSACTION_STATUS.COMPLETED,
    TRANSACTION_STATUS.CANCELLED,
  ],
  [TRANSACTION_STATUS.COMPLETED]: [],
  [TRANSACTION_STATUS.CANCELLED]: [],
};

export const VALID_KYC_TRANSITIONS: Record<KycPacketStatus, KycPacketStatus[]> = {
  [KYC_PACKET_STATUS.PENDING]: [KYC_PACKET_STATUS.IN_PROGRESS],
  [KYC_PACKET_STATUS.IN_PROGRESS]: [
    KYC_PACKET_STATUS.NEEDS_REVIEW,
    KYC_PACKET_STATUS.VERIFIED,
    KYC_PACKET_STATUS.REJECTED,
    KYC_PACKET_STATUS.PROVIDER_ERROR,
  ],
  [KYC_PACKET_STATUS.PROVIDER_ERROR]: [KYC_PACKET_STATUS.IN_PROGRESS],
  [KYC_PACKET_STATUS.NEEDS_REVIEW]: [KYC_PACKET_STATUS.VERIFIED, KYC_PACKET_STATUS.REJECTED],
  [KYC_PACKET_STATUS.VERIFIED]: [],
  [KYC_PACKET_STATUS.REJECTED]: [KYC_PACKET_STATUS.PENDING],
};

export const VALID_AGREEMENT_TRANSITIONS: Record<AgreementStatus, AgreementStatus[]> = {
  [AGREEMENT_STATUS.DRAFT]: [AGREEMENT_STATUS.SENT, AGREEMENT_STATUS.CANCELLED],
  [AGREEMENT_STATUS.SENT]: [
    AGREEMENT_STATUS.PARTIALLY_SIGNED,
    AGREEMENT_STATUS.SIGNED,
    AGREEMENT_STATUS.EXPIRED,
    AGREEMENT_STATUS.CANCELLED,
  ],
  [AGREEMENT_STATUS.PARTIALLY_SIGNED]: [
    AGREEMENT_STATUS.SIGNED,
    AGREEMENT_STATUS.EXPIRED,
    AGREEMENT_STATUS.CANCELLED,
  ],
  [AGREEMENT_STATUS.SIGNED]: [],
  [AGREEMENT_STATUS.EXPIRED]: [AGREEMENT_STATUS.DRAFT],
  [AGREEMENT_STATUS.CANCELLED]: [],
};

export const VALID_TOKEN_BOOKING_TRANSITIONS: Record<TokenBookingStatus, TokenBookingStatus[]> = {
  [TOKEN_BOOKING_STATUS.PENDING]: [TOKEN_BOOKING_STATUS.RECORDED, TOKEN_BOOKING_STATUS.CANCELLED],
  [TOKEN_BOOKING_STATUS.RECORDED]: [TOKEN_BOOKING_STATUS.CONFIRMED, TOKEN_BOOKING_STATUS.DISPUTED],
  [TOKEN_BOOKING_STATUS.CONFIRMED]: [],
  [TOKEN_BOOKING_STATUS.DISPUTED]: [TOKEN_BOOKING_STATUS.CONFIRMED, TOKEN_BOOKING_STATUS.CANCELLED],
  [TOKEN_BOOKING_STATUS.CANCELLED]: [],
};

export const VALID_DEPOSIT_RECORD_TRANSITIONS: Record<DepositRecordStatus, DepositRecordStatus[]> =
  {
    [DEPOSIT_RECORD_STATUS.PENDING]: [
      DEPOSIT_RECORD_STATUS.RECORDED,
      DEPOSIT_RECORD_STATUS.CANCELLED,
    ],
    [DEPOSIT_RECORD_STATUS.RECORDED]: [
      DEPOSIT_RECORD_STATUS.CONFIRMED,
      DEPOSIT_RECORD_STATUS.DISPUTED,
    ],
    [DEPOSIT_RECORD_STATUS.CONFIRMED]: [],
    [DEPOSIT_RECORD_STATUS.DISPUTED]: [
      DEPOSIT_RECORD_STATUS.CONFIRMED,
      DEPOSIT_RECORD_STATUS.CANCELLED,
    ],
    [DEPOSIT_RECORD_STATUS.CANCELLED]: [],
  };

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  [TRANSACTION_STATUS.INITIATED]: "Initiated",
  [TRANSACTION_STATUS.KYC_PENDING]: "KYC Pending",
  [TRANSACTION_STATUS.KYC_VERIFIED]: "KYC Verified",
  [TRANSACTION_STATUS.KYC_REJECTED]: "KYC Rejected",
  [TRANSACTION_STATUS.AGREEMENT_PENDING]: "Agreement Pending",
  [TRANSACTION_STATUS.AGREEMENT_SENT]: "Agreement Sent",
  [TRANSACTION_STATUS.AGREEMENT_SIGNED]: "Agreement Signed",
  [TRANSACTION_STATUS.TOKEN_PENDING]: "Token Pending",
  [TRANSACTION_STATUS.TOKEN_RECEIVED]: "Token Received",
  [TRANSACTION_STATUS.DEPOSIT_PENDING]: "Deposit Pending",
  [TRANSACTION_STATUS.DEPOSIT_RECEIVED]: "Deposit Received",
  [TRANSACTION_STATUS.MOVE_IN_SCHEDULED]: "Move-in Scheduled",
  [TRANSACTION_STATUS.COMPLETED]: "Completed",
  [TRANSACTION_STATUS.CANCELLED]: "Cancelled",
};

export const KYC_PACKET_STATUS_LABELS: Record<KycPacketStatus, string> = {
  [KYC_PACKET_STATUS.PENDING]: "Pending",
  [KYC_PACKET_STATUS.IN_PROGRESS]: "In Progress",
  [KYC_PACKET_STATUS.PROVIDER_ERROR]: "Provider Error",
  [KYC_PACKET_STATUS.NEEDS_REVIEW]: "Needs Review",
  [KYC_PACKET_STATUS.VERIFIED]: "Verified",
  [KYC_PACKET_STATUS.REJECTED]: "Rejected",
};

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  [AGREEMENT_STATUS.DRAFT]: "Draft",
  [AGREEMENT_STATUS.SENT]: "Sent",
  [AGREEMENT_STATUS.PARTIALLY_SIGNED]: "Partially Signed",
  [AGREEMENT_STATUS.SIGNED]: "Signed",
  [AGREEMENT_STATUS.EXPIRED]: "Expired",
  [AGREEMENT_STATUS.CANCELLED]: "Cancelled",
};

export const TOKEN_BOOKING_STATUS_LABELS: Record<TokenBookingStatus, string> = {
  [TOKEN_BOOKING_STATUS.PENDING]: "Pending",
  [TOKEN_BOOKING_STATUS.RECORDED]: "Recorded",
  [TOKEN_BOOKING_STATUS.CONFIRMED]: "Confirmed",
  [TOKEN_BOOKING_STATUS.DISPUTED]: "Disputed",
  [TOKEN_BOOKING_STATUS.CANCELLED]: "Cancelled",
};

export const DEPOSIT_RECORD_STATUS_LABELS: Record<DepositRecordStatus, string> = {
  [DEPOSIT_RECORD_STATUS.PENDING]: "Pending",
  [DEPOSIT_RECORD_STATUS.RECORDED]: "Recorded",
  [DEPOSIT_RECORD_STATUS.CONFIRMED]: "Confirmed",
  [DEPOSIT_RECORD_STATUS.DISPUTED]: "Disputed",
  [DEPOSIT_RECORD_STATUS.CANCELLED]: "Cancelled",
};

export const POLICE_VERIFICATION_STATUS_LABELS: Record<PoliceVerificationStatus, string> = {
  [POLICE_VERIFICATION_STATUS.NOT_STARTED]: "Not Started",
  [POLICE_VERIFICATION_STATUS.FORM_GENERATED]: "Form Generated",
  [POLICE_VERIFICATION_STATUS.SUBMITTED]: "Submitted",
  [POLICE_VERIFICATION_STATUS.VERIFIED]: "Verified",
  [POLICE_VERIFICATION_STATUS.REJECTED]: "Rejected",
};

export const CHAT_CHANNEL_STATUS = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const satisfies Record<string, string>;

export type ChatChannelStatus = (typeof CHAT_CHANNEL_STATUS)[keyof typeof CHAT_CHANNEL_STATUS];

export const CHAT_MESSAGE_STATUS = {
  SUBMITTED: "SUBMITTED",
  BATCHED: "BATCHED",
  PROCESSING: "PROCESSING",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
} as const satisfies Record<string, string>;

export type ChatMessageStatus = (typeof CHAT_MESSAGE_STATUS)[keyof typeof CHAT_MESSAGE_STATUS];

export const CHAT_BATCH_STATUS = {
  COLLECTING: "COLLECTING",
  PROCESSING: "PROCESSING",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
} as const satisfies Record<string, string>;

export type ChatBatchStatus = (typeof CHAT_BATCH_STATUS)[keyof typeof CHAT_BATCH_STATUS];

export const CHAT_SENDER_ROLE = {
  TENANT: "TENANT",
  OWNER: "OWNER",
  OPS: "OPS",
  SYSTEM: "SYSTEM",
} as const satisfies Record<string, string>;

export type ChatSenderRole = (typeof CHAT_SENDER_ROLE)[keyof typeof CHAT_SENDER_ROLE];

export const DEAL_CHECKLIST_STATUS = {
  DRAFT: "DRAFT",
  SHARED: "SHARED",
  IN_REVIEW: "IN_REVIEW",
  APPROVED: "APPROVED",
  DISPUTED: "DISPUTED",
  SUPERSEDED: "SUPERSEDED",
} as const satisfies Record<string, string>;

export type DealChecklistStatus =
  (typeof DEAL_CHECKLIST_STATUS)[keyof typeof DEAL_CHECKLIST_STATUS];

export const DEAL_CHECKLIST_ITEM_SOURCE = {
  AI_EXTRACTED: "AI_EXTRACTED",
  ADMIN_ADDED: "ADMIN_ADDED",
  PARTY_RAISED: "PARTY_RAISED",
} as const satisfies Record<string, string>;

export type DealChecklistItemSource =
  (typeof DEAL_CHECKLIST_ITEM_SOURCE)[keyof typeof DEAL_CHECKLIST_ITEM_SOURCE];

export const DEAL_CHECKLIST_ITEM_APPROVAL = {
  PENDING: "PENDING",
  AGREED: "AGREED",
  DISAGREED: "DISAGREED",
  COMMENTED: "COMMENTED",
} as const satisfies Record<string, string>;

export type DealChecklistItemApproval =
  (typeof DEAL_CHECKLIST_ITEM_APPROVAL)[keyof typeof DEAL_CHECKLIST_ITEM_APPROVAL];

export const DEAL_CHECKLIST_ITEM_OVERALL_STATUS = {
  UNREVIEWED: "UNREVIEWED",
  RESOLVED: "RESOLVED",
  DISPUTED: "DISPUTED",
  NEEDS_DISCUSSION: "NEEDS_DISCUSSION",
} as const satisfies Record<string, string>;

export type DealChecklistItemOverallStatus =
  (typeof DEAL_CHECKLIST_ITEM_OVERALL_STATUS)[keyof typeof DEAL_CHECKLIST_ITEM_OVERALL_STATUS];

export const DEAL_TERM_TYPE = {
  RENT_AMOUNT: "RENT_AMOUNT",
  DEPOSIT: "DEPOSIT",
  LEASE_DURATION: "LEASE_DURATION",
  MOVE_IN_DATE: "MOVE_IN_DATE",
  MAINTENANCE: "MAINTENANCE",
  ESCALATION_CLAUSE: "ESCALATION_CLAUSE",
  FURNISHING: "FURNISHING",
  LOCK_IN_PERIOD: "LOCK_IN_PERIOD",
  NOTICE_PERIOD: "NOTICE_PERIOD",
  BROKERAGE: "BROKERAGE",
  CUSTOM: "CUSTOM",
} as const satisfies Record<string, string>;

export type DealTermType = (typeof DEAL_TERM_TYPE)[keyof typeof DEAL_TERM_TYPE];

export const OWNER_INVITE_STATUS = {
  PENDING: "PENDING",
  CONSUMED: "CONSUMED",
  EXPIRED: "EXPIRED",
  REGENERATED: "REGENERATED",
} as const satisfies Record<string, string>;

export type OwnerInviteStatus = (typeof OWNER_INVITE_STATUS)[keyof typeof OWNER_INVITE_STATUS];

export const OWNER_SERVICE_REQUEST_STATUS = {
  SUBMITTED: "SUBMITTED",
  CONTACTED: "CONTACTED",
  ONBOARDED: "ONBOARDED",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  DROPPED: "DROPPED",
} as const satisfies Record<string, string>;

export type OwnerServiceRequestStatus =
  (typeof OWNER_SERVICE_REQUEST_STATUS)[keyof typeof OWNER_SERVICE_REQUEST_STATUS];

export const SUPPORT_INQUIRY_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
} as const satisfies Record<string, string>;

export type SupportInquiryStatus =
  (typeof SUPPORT_INQUIRY_STATUS)[keyof typeof SUPPORT_INQUIRY_STATUS];

export const VISIT_BOUNTY_STATUS = {
  POSTED: "POSTED",
  CLAIMED: "CLAIMED",
  EXPIRED: "EXPIRED",
  COMPLETED: "COMPLETED",
} as const satisfies Record<string, string>;

export type VisitBountyStatus = (typeof VISIT_BOUNTY_STATUS)[keyof typeof VISIT_BOUNTY_STATUS];

export const AUDIT_ACTOR_TYPE = {
  GUARD: "GUARD",
  ADMIN: "ADMIN",
  OPS: "OPS",
  TENANT: "TENANT",
  OWNER: "OWNER",
  SYSTEM: "SYSTEM",
} as const satisfies Record<string, string>;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPE)[keyof typeof AUDIT_ACTOR_TYPE];

export const QUALITY_FLAGS = {
  DUPLICATE_FLAT_MATCH: "DUPLICATE_FLAT_MATCH",
  DUPLICATE_PHONE_MATCH: "DUPLICATE_PHONE_MATCH",
  GUARD_HIGH_REJECTION: "GUARD_HIGH_REJECTION",
  OFF_SHIFT_SUBMISSION: "OFF_SHIFT_SUBMISSION",
} as const satisfies Record<string, string>;

export type QualityFlag = (typeof QUALITY_FLAGS)[keyof typeof QUALITY_FLAGS];

export const LANGUAGE_PREFERENCE = {
  en: "en",
  hi: "hi",
  hinglish: "hinglish",
} as const satisfies Record<string, string>;

export type LanguagePreference = (typeof LANGUAGE_PREFERENCE)[keyof typeof LANGUAGE_PREFERENCE];

export const VISIT_OUTCOME = {
  INTERESTED: "INTERESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  FOLLOWUP: "FOLLOWUP",
} as const satisfies Record<string, string>;

export type VisitOutcome = (typeof VISIT_OUTCOME)[keyof typeof VISIT_OUTCOME];

export const CHECKLIST_DEPTH = {
  LIGHT: "LIGHT",
  MEDIUM: "MEDIUM",
  FULL: "FULL",
} as const satisfies Record<string, string>;

export type ChecklistDepth = (typeof CHECKLIST_DEPTH)[keyof typeof CHECKLIST_DEPTH];

export const CHECKLIST_STATUS = {
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
} as const satisfies Record<string, string>;

export type ChecklistStatus = (typeof CHECKLIST_STATUS)[keyof typeof CHECKLIST_STATUS];

export const CONDITION_RATING = {
  EXCELLENT: "EXCELLENT",
  GOOD: "GOOD",
  FAIR: "FAIR",
  POOR: "POOR",
  NA: "NA",
} as const satisfies Record<string, string>;

export type ConditionRating = (typeof CONDITION_RATING)[keyof typeof CONDITION_RATING];

export const CHECKLIST_TYPE = {
  PROPERTY_INSPECTION: "PROPERTY_INSPECTION",
  MOVE_IN_HANDOVER: "MOVE_IN_HANDOVER",
} as const satisfies Record<string, string>;

export type ChecklistType = (typeof CHECKLIST_TYPE)[keyof typeof CHECKLIST_TYPE];

export const CHECKLIST_TYPE_LABELS: Record<ChecklistType, string> = {
  [CHECKLIST_TYPE.PROPERTY_INSPECTION]: "Property Inspection",
  [CHECKLIST_TYPE.MOVE_IN_HANDOVER]: "Move-in Handover",
};

export const CHECKLIST_ITEM_TYPE = {
  CONDITION: "CONDITION",
  CHECKBOX: "CHECKBOX",
  TEXT: "TEXT",
  NUMBER: "NUMBER",
  PHOTO: "PHOTO",
  PHOTO_CONDITION: "PHOTO_CONDITION",
} as const satisfies Record<string, string>;

export type ChecklistItemType = (typeof CHECKLIST_ITEM_TYPE)[keyof typeof CHECKLIST_ITEM_TYPE];

export const DOCUMENT_REQUIREMENT_TYPE = {
  OWNER_DOCS: "OWNER_DOCS",
  TENANT_DOCS: "TENANT_DOCS",
  SOCIETY_DOCS: "SOCIETY_DOCS",
} as const satisfies Record<string, string>;

export type DocumentRequirementType =
  (typeof DOCUMENT_REQUIREMENT_TYPE)[keyof typeof DOCUMENT_REQUIREMENT_TYPE];

export const DOCUMENT_ITEM_STATUS = {
  PENDING: "PENDING",
  COLLECTED: "COLLECTED",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  NA: "NA",
} as const satisfies Record<string, string>;

export type DocumentItemStatus = (typeof DOCUMENT_ITEM_STATUS)[keyof typeof DOCUMENT_ITEM_STATUS];

export const DOCUMENT_OVERALL_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
  BLOCKED: "BLOCKED",
} as const satisfies Record<string, string>;

export type DocumentOverallStatus =
  (typeof DOCUMENT_OVERALL_STATUS)[keyof typeof DOCUMENT_OVERALL_STATUS];

export const REGULATORY_ITEM_TYPE = {
  POLICE_VERIFICATION: "POLICE_VERIFICATION",
  RENT_REGISTRATION: "RENT_REGISTRATION",
  SOCIETY_NOC: "SOCIETY_NOC",
  STAMP_DUTY: "STAMP_DUTY",
} as const satisfies Record<string, string>;

export type RegulatoryItemType = (typeof REGULATORY_ITEM_TYPE)[keyof typeof REGULATORY_ITEM_TYPE];

export const REGULATORY_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  OVERDUE: "OVERDUE",
  WAIVED: "WAIVED",
} as const satisfies Record<string, string>;

export type RegulatoryStatus = (typeof REGULATORY_STATUS)[keyof typeof REGULATORY_STATUS];

export const PERMISSIONS = {
  SOCIETIES_VIEW: "societies.view",
  SOCIETIES_CREATE: "societies.create",
  SOCIETIES_EDIT: "societies.edit",
  SOCIETIES_DELETE: "societies.delete",
  BUILDINGS_VIEW: "buildings.view",
  BUILDINGS_CREATE: "buildings.create",
  BUILDINGS_EDIT: "buildings.edit",
  BUILDINGS_DELETE: "buildings.delete",
  GUARDS_VIEW: "guards.view",
  GUARDS_CREATE: "guards.create",
  GUARDS_EDIT: "guards.edit",
  GUARDS_MANAGE_STATUS: "guards.manage_status",
  GUARDS_MANAGE_SHIFTS: "guards.manage_shifts",
  GUARDS_RESET_PASSWORD: "guards.reset_password",
  LEADS_VIEW: "leads.view",
  LEADS_REQUEST_INFO: "leads.request_info",
  LEADS_VERIFY: "leads.verify",
  LEADS_REJECT: "leads.reject",
  LEADS_MARK_DUPLICATE: "leads.mark_duplicate",
  LEADS_SET_BOUNTY: "leads.set_bounty",
  LISTINGS_VIEW: "listings.view",
  LISTINGS_CREATE: "listings.create",
  LISTINGS_EDIT: "listings.edit",
  LISTINGS_PUBLISH: "listings.publish",
  LISTINGS_VIEW_INQUIRIES: "listings.view_inquiries",
  TRUST_BADGES_MANAGE: "trust_badges.manage", // Reserved for future admin-triggered recompute
  TRUST_BADGES_VIEW: "trust_badges.view",
  VISITS_VIEW: "visits.view",
  VISITS_CREATE: "visits.create",
  VISITS_EDIT: "visits.edit",
  VISITS_CANCEL: "visits.cancel",
  CLOSURES_VIEW: "closures.view",
  CLOSURES_CREATE: "closures.create",
  CLOSURES_EDIT: "closures.edit",
  CLOSURES_CONFIRM: "closures.confirm",
  OWNERS_VIEW: "owners.view",
  OWNERS_CREATE: "owners.create",
  OWNERS_EDIT: "owners.edit",
  OWNERS_MERGE: "owners.merge",
  OWNERS_MANAGE_LIFECYCLE: "owners.manage_lifecycle",
  RM_VIEW: "rm.view",
  RM_MANAGE: "rm.manage",
  RM_REASSIGN: "rm.reassign",
  RM_CHECK_IN: "rm.check_in",
  PAYOUTS_VIEW: "payouts.view",
  PAYOUTS_CREATE: "payouts.create",
  PAYOUTS_APPROVE: "payouts.approve",
  PAYOUTS_DISBURSE: "payouts.disburse",
  PAYOUTS_VOID: "payouts.void",
  REFERRALS_VIEW: "referrals.view",
  REFERRALS_MANAGE: "referrals.manage",
  REFERRALS_CONFIGURE: "referrals.configure",
  REFERRALS_APPROVE_PAYOUT: "referrals.approve_payout",
  INCENTIVES_VIEW: "incentives.view",
  INCENTIVES_AWARD: "incentives.award",
  INCENTIVES_EXPIRE: "incentives.expire",
  INCENTIVES_MANAGE: "incentives.manage",
  COMMISSION_CONFIGURE: "commission.configure",
  COMMISSION_VIEW: "commission.view",
  ATTRIBUTION_COMPUTE: "attribution.compute",
  ATTRIBUTION_DISPUTE: "attribution.dispute",
  ATTRIBUTION_OVERRIDE: "attribution.override",
  ATTRIBUTION_VIEW: "attribution.view",
  GAMIFICATION_MANAGE: "gamification.manage",
  GAMIFICATION_VIEW: "gamification.view",
  SHADOW_MODE_VIEW: "shadow_mode.view",
  SHADOW_MODE_MANAGE: "shadow_mode.manage",
  DISBURSEMENT_APPROVE: "disbursement.approve",
  DISBURSEMENT_VOID: "disbursement.void",
  QUALITY_VIEW: "quality.view",
  ANALYTICS_VIEW: "analytics.view",
  AUDIT_VIEW: "audit.view",
  OPS_MANAGEMENT_VIEW: "ops_management.view",
  OPS_MANAGEMENT_SET_TARGETS: "ops_management.set_targets",
  OPS_MANAGEMENT_ISSUE_WARNINGS: "ops_management.issue_warnings",
  OPS_MANAGEMENT_WRITE_CHECKINS: "ops_management.write_checkins",
  OPS_MANAGEMENT_CONFIGURE: "ops_management.configure",
  TENANT_INQUIRIES_VIEW: "tenant_inquiries.view",
  TENANT_INQUIRIES_MANAGE: "tenant_inquiries.manage",
  NEGOTIATIONS_VIEW: "negotiations.view",
  NEGOTIATIONS_MANAGE: "negotiations.manage",
  TRANSACTIONS_VIEW: "transactions.view",
  TRANSACTIONS_MANAGE: "transactions.manage",
  KYC_VERIFY: "kyc.verify",
  AGREEMENTS_GENERATE: "agreements.generate",
  AGREEMENTS_SIGN: "agreements.sign",
  CHAT_VIEW: "chat.view",
  CHAT_SEND: "chat.send",
  CHAT_MODERATE: "chat.moderate",
  CHAT_ADMIN: "chat.admin",
  OWNER_INVITES_MANAGE: "owner_invites.manage",
  DEAL_CHECKLISTS_VIEW: "deal_checklists.view",
  DEAL_CHECKLISTS_MANAGE: "deal_checklists.manage",
  DEAL_CHECKLISTS_APPROVE: "deal_checklists.approve",
  OWNER_SERVICE_REQUESTS_VIEW: "owner_service_requests.view",
  OWNER_SERVICE_REQUESTS_MANAGE: "owner_service_requests.manage",
  SUPPORT_INQUIRIES_VIEW: "support_inquiries.view",
  SUPPORT_INQUIRIES_MANAGE: "support_inquiries.manage",
  NOTIFICATIONS_VIEW: "notifications.view",
  NOTIFICATIONS_MANAGE: "notifications.manage",
  NOTIFICATION_TEMPLATES_MANAGE: "notification_templates.manage",
  MONETIZATION_VIEW: "monetization.view",
  MONETIZATION_CONFIGURE: "monetization.configure",
  TRANSACTION_FEES_MANAGE: "transaction_fees.manage",
  TENANT_PASSES_VIEW: "tenant_passes.view",
  PROMOTED_LISTINGS_MANAGE: "promoted_listings.manage",
  PARTNER_SERVICES_MANAGE: "partner_services.manage",
  SERVICE_BUNDLES_MANAGE: "service_bundles.manage",
  REVENUE_VIEW: "revenue.view",
  USERS_MANAGE: "users.manage",
  ROLES_VIEW: "roles.view",
  ROLES_MANAGE: "roles.manage",
  ADMINS_CREATE: "admins.create",
  ADMINS_EDIT: "admins.edit",
  SYSTEM_CONFIGURE: "system.configure",
} as const satisfies Record<string, string>;

export const ALL_PERMISSIONS = Array.from(
  new Set([...Object.values(PERMISSIONS)]),
);

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const AUDIT_ACTIONS = {
  SOCIETIES_INSERT: "SOCIETIES_INSERT",
  SOCIETIES_UPDATE: "SOCIETIES_UPDATE",
  BUILDINGS_INSERT: "BUILDINGS_INSERT",
  BUILDINGS_UPDATE: "BUILDINGS_UPDATE",
  USERS_INSERT: "USERS_INSERT",
  USERS_UPDATE: "USERS_UPDATE",
  GUARD_PROFILES_INSERT: "GUARD_PROFILES_INSERT",
  GUARD_PROFILES_UPDATE: "GUARD_PROFILES_UPDATE",
  GUARD_SHIFTS_INSERT: "GUARD_SHIFTS_INSERT",
  GUARD_SHIFTS_UPDATE: "GUARD_SHIFTS_UPDATE",
  GUARD_SHIFTS_DELETE: "GUARD_SHIFTS_DELETE",
  LEADS_INSERT: "LEADS_INSERT",
  LEADS_UPDATE: "LEADS_UPDATE",
  OWNERS_INSERT: "OWNERS_INSERT",
  OWNERS_UPDATE: "OWNERS_UPDATE",
  OWNER_RM_ASSIGNMENTS_INSERT: "OWNER_RM_ASSIGNMENTS_INSERT",
  OWNER_RM_ASSIGNMENTS_UPDATE: "OWNER_RM_ASSIGNMENTS_UPDATE",
  RM_CHECK_INS_INSERT: "RM_CHECK_INS_INSERT",
  OPS_KPI_TARGETS_INSERT: "OPS_KPI_TARGETS_INSERT",
  OPS_KPI_TARGETS_UPDATE: "OPS_KPI_TARGETS_UPDATE",
  OPS_KPI_TARGETS_DELETE: "OPS_KPI_TARGETS_DELETE",
  OPS_WARNINGS_INSERT: "OPS_WARNINGS_INSERT",
  OPS_WARNINGS_UPDATE: "OPS_WARNINGS_UPDATE",
  OPS_WARNINGS_DELETE: "OPS_WARNINGS_DELETE",
  OPS_CHECK_IN_NOTES_INSERT: "OPS_CHECK_IN_NOTES_INSERT",
  OPS_CHECK_IN_NOTES_UPDATE: "OPS_CHECK_IN_NOTES_UPDATE",
  OPS_CHECK_IN_NOTES_DELETE: "OPS_CHECK_IN_NOTES_DELETE",
  OWNER_VERIFICATIONS_INSERT: "OWNER_VERIFICATIONS_INSERT",
  LISTINGS_INSERT: "LISTINGS_INSERT",
  LISTINGS_UPDATE: "LISTINGS_UPDATE",
  VISITS_INSERT: "VISITS_INSERT",
  VISITS_UPDATE: "VISITS_UPDATE",
  CLOSURES_INSERT: "CLOSURES_INSERT",
  CLOSURES_UPDATE: "CLOSURES_UPDATE",
  PAYOUTS_INSERT: "PAYOUTS_INSERT",
  PAYOUTS_UPDATE: "PAYOUTS_UPDATE",
  REFERRAL_CODES_INSERT: "REFERRAL_CODES_INSERT",
  REFERRAL_CODES_UPDATE: "REFERRAL_CODES_UPDATE",
  REFERRALS_INSERT: "REFERRALS_INSERT",
  REFERRALS_UPDATE: "REFERRALS_UPDATE",
  REFERRAL_MILESTONES_INSERT: "REFERRAL_MILESTONES_INSERT",
  REFERRAL_MILESTONES_UPDATE: "REFERRAL_MILESTONES_UPDATE",
  REFERRAL_CONFIG_INSERT: "REFERRAL_CONFIG_INSERT",
  REFERRAL_CONFIG_UPDATE: "REFERRAL_CONFIG_UPDATE",
  TENANT_INQUIRIES_INSERT: "TENANT_INQUIRIES_INSERT",
  TENANT_INQUIRIES_UPDATE: "TENANT_INQUIRIES_UPDATE",
  TENANT_FAVORITES_INSERT: "TENANT_FAVORITES_INSERT",
  TENANT_FAVORITES_UPDATE: "TENANT_FAVORITES_UPDATE",
  TENANT_FAVORITES_DELETE: "TENANT_FAVORITES_DELETE",
  TENANT_FAVORITE_ADD: "TENANT_FAVORITE_ADD",
  TENANT_FAVORITE_REMOVE: "TENANT_FAVORITE_REMOVE",
  RENTAL_TRANSACTIONS_INSERT: "RENTAL_TRANSACTIONS_INSERT",
  RENTAL_TRANSACTIONS_UPDATE: "RENTAL_TRANSACTIONS_UPDATE",
  RENTAL_AGREEMENTS_INSERT: "RENTAL_AGREEMENTS_INSERT",
  RENTAL_AGREEMENTS_UPDATE: "RENTAL_AGREEMENTS_UPDATE",
  KYC_PACKETS_INSERT: "KYC_PACKETS_INSERT",
  KYC_PACKETS_UPDATE: "KYC_PACKETS_UPDATE",
  TOKEN_BOOKINGS_INSERT: "TOKEN_BOOKINGS_INSERT",
  TOKEN_BOOKINGS_UPDATE: "TOKEN_BOOKINGS_UPDATE",
  DEPOSIT_RECORDS_INSERT: "DEPOSIT_RECORDS_INSERT",
  DEPOSIT_RECORDS_UPDATE: "DEPOSIT_RECORDS_UPDATE",
  HANDOVER_CHECKLISTS_INSERT: "HANDOVER_CHECKLISTS_INSERT",
  HANDOVER_CHECKLISTS_UPDATE: "HANDOVER_CHECKLISTS_UPDATE",
  NEGOTIATIONS_INSERT: "NEGOTIATIONS_INSERT",
  NEGOTIATIONS_UPDATE: "NEGOTIATIONS_UPDATE",
  NEGOTIATION_TERMS_PROPOSALS_INSERT: "NEGOTIATION_TERMS_PROPOSALS_INSERT",
  NEGOTIATION_TERMS_PROPOSALS_UPDATE: "NEGOTIATION_TERMS_PROPOSALS_UPDATE",
  NEGOTIATION_TERMS_SIGNATURES_INSERT: "NEGOTIATION_TERMS_SIGNATURES_INSERT",
  NEGOTIATION_TOKEN_RECORDS_INSERT: "NEGOTIATION_TOKEN_RECORDS_INSERT",
  NEGOTIATION_TOKEN_RECORDS_UPDATE: "NEGOTIATION_TOKEN_RECORDS_UPDATE",
  CHAT_CHANNELS_INSERT: "CHAT_CHANNELS_INSERT",
  CHAT_CHANNELS_UPDATE: "CHAT_CHANNELS_UPDATE",
  CHAT_MESSAGES_INSERT: "CHAT_MESSAGES_INSERT",
  CHAT_MESSAGES_UPDATE: "CHAT_MESSAGES_UPDATE",
  CHAT_MESSAGE_BATCHES_INSERT: "CHAT_MESSAGE_BATCHES_INSERT",
  CHAT_MESSAGE_BATCHES_UPDATE: "CHAT_MESSAGE_BATCHES_UPDATE",
  CHAT_READ_RECEIPTS_INSERT: "CHAT_READ_RECEIPTS_INSERT",
  CHAT_READ_RECEIPTS_UPDATE: "CHAT_READ_RECEIPTS_UPDATE",
  OWNER_INVITES_INSERT: "OWNER_INVITES_INSERT",
  OWNER_INVITES_UPDATE: "OWNER_INVITES_UPDATE",
  OWNER_INVITES_DELETE: "OWNER_INVITES_DELETE",
  DEAL_CHECKLISTS_INSERT: "DEAL_CHECKLISTS_INSERT",
  DEAL_CHECKLISTS_UPDATE: "DEAL_CHECKLISTS_UPDATE",
  DEAL_CHECKLISTS_DELETE: "DEAL_CHECKLISTS_DELETE",
  DEAL_CHECKLIST_SIGNATURES_INSERT: "DEAL_CHECKLIST_SIGNATURES_INSERT",
  DEAL_CHECKLIST_SIGNATURES_UPDATE: "DEAL_CHECKLIST_SIGNATURES_UPDATE",
  DEAL_CHECKLIST_SIGNATURES_DELETE: "DEAL_CHECKLIST_SIGNATURES_DELETE",
  OWNER_SERVICE_REQUESTS_INSERT: "OWNER_SERVICE_REQUESTS_INSERT",
  OWNER_SERVICE_REQUESTS_UPDATE: "OWNER_SERVICE_REQUESTS_UPDATE",
  SUPPORT_INQUIRIES_INSERT: "SUPPORT_INQUIRIES_INSERT",
  SUPPORT_INQUIRIES_UPDATE: "SUPPORT_INQUIRIES_UPDATE",
  NOTIFICATION_PREFERENCES_INSERT: "NOTIFICATION_PREFERENCES_INSERT",
  NOTIFICATION_PREFERENCES_UPDATE: "NOTIFICATION_PREFERENCES_UPDATE",
  NOTIFICATION_TEMPLATES_INSERT: "NOTIFICATION_TEMPLATES_INSERT",
  NOTIFICATION_TEMPLATES_UPDATE: "NOTIFICATION_TEMPLATES_UPDATE",
  NOTIFICATIONS_INSERT: "NOTIFICATIONS_INSERT",
  NOTIFICATIONS_UPDATE: "NOTIFICATIONS_UPDATE",
  TENANT_INQUIRY_NEGOTIATION_INITIATED: "tenant_inquiry.negotiation_initiated",
  INCENTIVE_CARDS_INSERT: "INCENTIVE_CARDS_INSERT",
  INCENTIVE_CARDS_UPDATE: "INCENTIVE_CARDS_UPDATE",
  QUALITY_SCORE_HISTORY_INSERT: "QUALITY_SCORE_HISTORY_INSERT",
  QUALITY_SCORE_HISTORY_UPDATE: "QUALITY_SCORE_HISTORY_UPDATE",
  GUARD_STREAKS_INSERT: "GUARD_STREAKS_INSERT",
  GUARD_STREAKS_UPDATE: "GUARD_STREAKS_UPDATE",
  PAYOUT_ADJUSTMENTS_INSERT: "PAYOUT_ADJUSTMENTS_INSERT",
  PAYOUT_ADJUSTMENTS_UPDATE: "PAYOUT_ADJUSTMENTS_UPDATE",
  ROLES_INSERT: "ROLES_INSERT",
  ROLES_UPDATE: "ROLES_UPDATE",
  USER_ROLE_ASSIGNMENTS_INSERT: "USER_ROLE_ASSIGNMENTS_INSERT",
  USER_ROLE_ASSIGNMENTS_UPDATE: "USER_ROLE_ASSIGNMENTS_UPDATE",
  SYSTEM_CONFIG_INSERT: "SYSTEM_CONFIG_INSERT",
  SYSTEM_CONFIG_UPDATE: "SYSTEM_CONFIG_UPDATE",
  CHECKLIST_TEMPLATES_INSERT: "CHECKLIST_TEMPLATES_INSERT",
  CHECKLIST_TEMPLATES_UPDATE: "CHECKLIST_TEMPLATES_UPDATE",
  CHECKLIST_INSTANCES_INSERT: "CHECKLIST_INSTANCES_INSERT",
  CHECKLIST_INSTANCES_UPDATE: "CHECKLIST_INSTANCES_UPDATE",
  DOCUMENT_REQUIREMENTS_INSERT: "DOCUMENT_REQUIREMENTS_INSERT",
  DOCUMENT_REQUIREMENTS_UPDATE: "DOCUMENT_REQUIREMENTS_UPDATE",
  REGULATORY_ITEMS_INSERT: "REGULATORY_ITEMS_INSERT",
  REGULATORY_ITEMS_UPDATE: "REGULATORY_ITEMS_UPDATE",
  DEAL_CONTRIBUTIONS_CREATE: "DEAL_CONTRIBUTIONS_CREATE",
  DEAL_CONTRIBUTIONS_UPDATE: "DEAL_CONTRIBUTIONS_UPDATE",
  ATTRIBUTION_RECORDS_CREATE: "ATTRIBUTION_RECORDS_CREATE",
  ATTRIBUTION_RECORDS_UPDATE: "ATTRIBUTION_RECORDS_UPDATE",
  ATTRIBUTION_SPLITS_CREATE: "ATTRIBUTION_SPLITS_CREATE",
  INCENTIVE_DISBURSEMENTS_CREATE: "INCENTIVE_DISBURSEMENTS_CREATE",
  INCENTIVE_DISBURSEMENTS_UPDATE: "INCENTIVE_DISBURSEMENTS_UPDATE",
  GAMIFICATION_PROFILES_CREATE: "GAMIFICATION_PROFILES_CREATE",
  GAMIFICATION_PROFILES_UPDATE: "GAMIFICATION_PROFILES_UPDATE",
  GAMIFICATION_QUESTS_CREATE: "GAMIFICATION_QUESTS_CREATE",
  GAMIFICATION_QUESTS_UPDATE: "GAMIFICATION_QUESTS_UPDATE",
  USER_QUEST_PROGRESS_CREATE: "USER_QUEST_PROGRESS_CREATE",
  USER_QUEST_PROGRESS_UPDATE: "USER_QUEST_PROGRESS_UPDATE",
  TRUST_BADGE_COMPUTE: "TRUST_BADGE_COMPUTE",
  TRUST_BADGE_UPDATE: "TRUST_BADGE_UPDATE",
  COMMISSION_EVALUATE: "COMMISSION_EVALUATE",
  ATTRIBUTION_COMPUTE: "ATTRIBUTION_COMPUTE",
  DISBURSEMENT_CREATE: "DISBURSEMENT_CREATE",
  DISBURSEMENT_APPROVE: "DISBURSEMENT_APPROVE",
  DISBURSEMENT_VOID: "DISBURSEMENT_VOID",
  CONFIG_VERSION_ACTIVATE: "CONFIG_VERSION_ACTIVATE",
  CONFIG_VERSION_ARCHIVE: "CONFIG_VERSION_ARCHIVE",
  MODIFIER_TEMPLATE_CREATE: "MODIFIER_TEMPLATE_CREATE",
  MODIFIER_TEMPLATE_UPDATE: "MODIFIER_TEMPLATE_UPDATE",
  OPS_KPI_TARGET_CREATE: "ops_kpi_target.create",
  OPS_KPI_TARGET_UPDATE: "ops_kpi_target.update",
  OPS_KPI_TARGET_CANCEL: "ops_kpi_target.cancel",
  OPS_KPI_TARGET_BULK_CREATE: "ops_kpi_target.bulk_create",
  OPS_KPI_TARGET_ROLL_FORWARD: "ops_kpi_target.roll_forward",
  OPS_WARNING_ISSUE: "ops_warning.issue",
  OPS_WARNING_ACKNOWLEDGE: "ops_warning.acknowledge",
  OPS_WARNING_RESOLVE: "ops_warning.resolve",
  OPS_WARNING_ESCALATE: "ops_warning.escalate",
  OPS_CHECK_IN_CREATE: "ops_check_in.create",
  OPS_CHECK_IN_UPDATE: "ops_check_in.update",
  OPS_CHECK_IN_TOGGLE_ACTION_ITEM: "ops_check_in.toggle_action_item",
} as const satisfies Record<string, string>;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const P44_CONFIG_KEYS = {
  OPS_FIELD_WORKER_ENABLED: "ops_field_worker_enabled",
  OPS_FIELD_WORKER_CANARY_USER_IDS: "ops_field_worker_canary_user_ids",
  DEFAULT_UNASSIGNED_SOCIETY_ID: "default_unassigned_society_id",
} as const;

export const P45_CONFIG_KEYS = {
  MULTI_PERSONA_ENABLED: "multi_persona_enabled",
} as const;

export const P44_DEFAULTS = {
  OPS_FIELD_WORKER_ENABLED: false,
  OPS_FIELD_WORKER_CANARY_USER_IDS: [] as string[],
} as const;

export const SYSTEM_CONFIG_KEYS = {
  MAX_LEADS_PER_GUARD_PER_DAY: "max_leads_per_guard_per_day",
  DEDUP_FLAT_WINDOW_DAYS: "dedup_flat_window_days",
  DEDUP_PHONE_WINDOW_DAYS: "dedup_phone_window_days",
  INCENTIVE_LEAD_SUBMITTER_BRONZE: "incentive_lead_submitter_bronze",
  INCENTIVE_LEAD_SUBMITTER_SILVER: "incentive_lead_submitter_silver",
  INCENTIVE_LEAD_SUBMITTER_GOLD: "incentive_lead_submitter_gold",
  INCENTIVE_LEAD_SUBMITTER_PLATINUM: "incentive_lead_submitter_platinum",
  INCENTIVE_VISIT_HANDLER_BRONZE: "incentive_visit_handler_bronze",
  INCENTIVE_VISIT_HANDLER_SILVER: "incentive_visit_handler_silver",
  INCENTIVE_VISIT_HANDLER_GOLD: "incentive_visit_handler_gold",
  INCENTIVE_VISIT_HANDLER_PLATINUM: "incentive_visit_handler_platinum",
  INCENTIVE_QUALITY_CHAMPION_BRONZE: "incentive_quality_champion_bronze",
  INCENTIVE_QUALITY_CHAMPION_SILVER: "incentive_quality_champion_silver",
  INCENTIVE_QUALITY_CHAMPION_GOLD: "incentive_quality_champion_gold",
  INCENTIVE_QUALITY_CHAMPION_PLATINUM: "incentive_quality_champion_platinum",
  INCENTIVE_QUALITY_CHAMPION_MIN_LEADS: "incentive_quality_champion_min_leads",
  QUALITY_SCORE_WEIGHTS: "quality_score_weights",
  QUALITY_WEIGHT_CHECKLIST: "quality_weight_checklist",
  QUALITY_WEIGHT_PHOTO: "quality_weight_photo",
  QUALITY_WEIGHT_SPEED: "quality_weight_speed",
  QUALITY_WEIGHT_VERIFICATION: "quality_weight_verification",
  QUALITY_WEIGHT_DOCUMENT: "quality_weight_document",
  QUALITY_TIER_BRONZE_MIN: "quality_tier_bronze_min",
  QUALITY_TIER_SILVER_MIN: "quality_tier_silver_min",
  QUALITY_TIER_GOLD_MIN: "quality_tier_gold_min",
  QUALITY_TIER_PLATINUM_MIN: "quality_tier_platinum_min",
  STREAK_BONUS_3DAY_PAISE: "streak_bonus_3day_paise",
  STREAK_BONUS_7DAY_PAISE: "streak_bonus_7day_paise",
  STREAK_BONUS_14DAY_PAISE: "streak_bonus_14day_paise",
  STREAK_BONUS_30DAY_PAISE: "streak_bonus_30day_paise",
  PENALTY_NO_SHOW_PAISE: "penalty_no_show_paise",
  MIN_QUALITY_SCORE_FOR_INCENTIVES: "min_quality_score_for_incentives",
  DEMORENTALS_CONTACT_PHONE: "demorentals_contact_phone",
  DEMORENTALS_WHATSAPP_PHONE: "demorentals_whatsapp_phone",
  TENANT_BOUNTY_DEFAULT_AMOUNT: "tenant_bounty_default_amount",
  TENANT_BOUNTY_EXPIRY_DAYS: "tenant_bounty_expiry_days",
  TENANT_BOUNTY_DEFAULT_EXPIRY_DAYS: "tenant_bounty_default_expiry_days",
  SEED_DEMO_VERSION: "seed_demo_version",
  NEGOTIATION_STALE_DAYS: "negotiation_stale_days",
  NEGOTIATION_MAX_ROUNDS: "negotiation_max_rounds",
  NEGOTIATION_TOKEN_AGREEMENT_DAYS: "negotiation_token_agreement_days",
  TRUST_BADGE_FRESHNESS_THRESHOLD_DAYS: "trust_badge_freshness_threshold_days",
  TRUST_BADGE_MIN_PHOTOS: "trust_badge_min_photos",
  CHAT_AI_MODEL: "chat_ai_model",
  CHAT_BATCH_WINDOW_MS: "chat_batch_window_ms",
  CHAT_MAX_MESSAGE_LENGTH: "chat_max_message_length",
  CHAT_OWNER_INVITE_EXPIRY_DAYS: "chat_owner_invite_expiry_days",
  CHAT_PII_FAIL_ACTION: "chat_pii_fail_action",
  NOTIFICATION_QUIET_HOURS_START: "notification_quiet_hours_start",
  NOTIFICATION_QUIET_HOURS_END: "notification_quiet_hours_end",
  NOTIFICATION_DEDUP_WINDOW_MS: "notification_dedup_window_ms",
  NOTIFICATION_MAX_RETRIES: "notification_max_retries",
  NOTIFICATION_RETRY_BASE_MS: "notification_retry_base_ms",
  TRANSACTION_AUTO_CANCEL_DAYS: "transaction_auto_cancel_days",
  KYC_PROVIDER_TIMEOUT_MS: "kyc_provider_timeout_ms",
  ESIGN_DEADLINE_DAYS: "esign_deadline_days",
  INCENTIVE_V3_ACTIVE_CONFIG_VERSION: "incentive_v3_active_config_version",
  INCENTIVE_V3_FEATURE_FLAGS: "incentive_v3_feature_flags",
  INCENTIVE_V3_ROLLOUT_POLICY: "incentive_v3_rollout_policy",
  INCENTIVE_V3_SHADOW_MODE_ENABLED: "incentive_v3_shadow_mode_enabled",
  INCENTIVE_V3_DECOMMISSION_VARIANCE_THRESHOLD: "incentive_v3_decommission_variance_threshold",
  OPS_FIELD_WORKER_ENABLED: "ops_field_worker_enabled",
  OPS_FIELD_WORKER_CANARY_USER_IDS: "ops_field_worker_canary_user_ids",
  DEFAULT_UNASSIGNED_SOCIETY_ID: "default_unassigned_society_id",
  MULTI_PERSONA_ENABLED: "multi_persona_enabled",
  WARNING_QUALITY_THRESHOLD: "warning_quality_threshold",
  WARNING_TARGET_MISS_STREAK: "warning_target_miss_streak",
  WARNING_SLA_BREACH_COUNT_30D: "warning_sla_breach_count_30d",
  WARNING_INACTIVITY_DAYS: "warning_inactivity_days",
  WARNING_LEVEL1_EXPIRY_DAYS: "warning_level1_expiry_days",
  WARNING_LEVEL2_EXPIRY_DAYS: "warning_level2_expiry_days",
  WARNING_ESCALATION_AUTO: "warning_escalation_auto",
  CHECKIN_OVERDUE_DAYS: "checkin_overdue_days",
  CASELOAD_THRESHOLD: "caseload_threshold",
  FEE_SLAB_LT_20K_PAISE: "fee_slab_lt_20k_paise",
  FEE_SLAB_BT_20K_40K_PAISE: "fee_slab_bt_20k_40k_paise",
  FEE_SLAB_BT_40K_80K_PAISE: "fee_slab_bt_40k_80k_paise",
  DISCOVERY_PASS_BASIC_PRICE_PAISE: "discovery_pass_basic_price_paise",
  DISCOVERY_PASS_BASIC_CREDIT_PAISE: "discovery_pass_basic_credit_paise",
  DISCOVERY_PASS_PLUS_PRICE_PAISE: "discovery_pass_plus_price_paise",
  DISCOVERY_PASS_PLUS_CREDIT_PAISE: "discovery_pass_plus_credit_paise",
  DISCOVERY_PASS_PREMIUM_PRICE_PAISE: "discovery_pass_premium_price_paise",
  DISCOVERY_PASS_PREMIUM_CREDIT_PAISE: "discovery_pass_premium_credit_paise",
  DISCOVERY_PASS_VALIDITY_DAYS: "discovery_pass_validity_days",
  PROMOTION_7D_PRICE_PAISE: "promotion_7d_price_paise",
  PROMOTION_14D_PRICE_PAISE: "promotion_14d_price_paise",
  PROMOTION_30D_PRICE_PAISE: "promotion_30d_price_paise",
  PROMOTED_LISTINGS_MAX_PER_PAGE: "promoted_listings_max_per_page",
  PROMOTED_LISTINGS_SLOTS: "promoted_listings_slots",
} as const satisfies Record<string, string>;

export type SystemConfigKey = (typeof SYSTEM_CONFIG_KEYS)[keyof typeof SYSTEM_CONFIG_KEYS];

export const SYSTEM_CONFIG_DEFAULTS = {
  [SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY]: "5",
  [SYSTEM_CONFIG_KEYS.DEDUP_FLAT_WINDOW_DAYS]: "90",
  [SYSTEM_CONFIG_KEYS.DEDUP_PHONE_WINDOW_DAYS]: "30",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_BRONZE]: "10",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_SILVER]: "25",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_GOLD]: "50",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_PLATINUM]: "100",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_BRONZE]: "10",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_SILVER]: "25",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_GOLD]: "50",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_PLATINUM]: "100",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_BRONZE]: "70",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_SILVER]: "80",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_GOLD]: "90",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_PLATINUM]: "95",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_MIN_LEADS]: "10",
  [SYSTEM_CONFIG_KEYS.QUALITY_SCORE_WEIGHTS]:
    '{"lead_approval_rate":40,"visit_completion_rate":30,"flag_frequency":20,"speed_bonus":10}',
  [SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_CHECKLIST]: "30",
  [SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_PHOTO]: "25",
  [SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_SPEED]: "20",
  [SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_VERIFICATION]: "15",
  [SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_DOCUMENT]: "10",
  [SYSTEM_CONFIG_KEYS.QUALITY_TIER_BRONZE_MIN]: "0",
  [SYSTEM_CONFIG_KEYS.QUALITY_TIER_SILVER_MIN]: "50",
  [SYSTEM_CONFIG_KEYS.QUALITY_TIER_GOLD_MIN]: "75",
  [SYSTEM_CONFIG_KEYS.QUALITY_TIER_PLATINUM_MIN]: "90",
  [SYSTEM_CONFIG_KEYS.STREAK_BONUS_3DAY_PAISE]: "20000",
  [SYSTEM_CONFIG_KEYS.STREAK_BONUS_7DAY_PAISE]: "50000",
  [SYSTEM_CONFIG_KEYS.STREAK_BONUS_14DAY_PAISE]: "100000",
  [SYSTEM_CONFIG_KEYS.STREAK_BONUS_30DAY_PAISE]: "200000",
  [SYSTEM_CONFIG_KEYS.PENALTY_NO_SHOW_PAISE]: "20000",
  [SYSTEM_CONFIG_KEYS.MIN_QUALITY_SCORE_FOR_INCENTIVES]: "50",
  [SYSTEM_CONFIG_KEYS.DEMORENTALS_CONTACT_PHONE]: '""',
  [SYSTEM_CONFIG_KEYS.DEMORENTALS_WHATSAPP_PHONE]: '""',
  [SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_DEFAULT_AMOUNT]: "50000",
  [SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_EXPIRY_DAYS]: "3",
  [SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_DEFAULT_EXPIRY_DAYS]: "3",
  [SYSTEM_CONFIG_KEYS.SEED_DEMO_VERSION]: "0",
  [SYSTEM_CONFIG_KEYS.NEGOTIATION_STALE_DAYS]: "7",
  [SYSTEM_CONFIG_KEYS.NEGOTIATION_MAX_ROUNDS]: "5",
  [SYSTEM_CONFIG_KEYS.NEGOTIATION_TOKEN_AGREEMENT_DAYS]: "3",
  [SYSTEM_CONFIG_KEYS.TRUST_BADGE_FRESHNESS_THRESHOLD_DAYS]: "30",
  [SYSTEM_CONFIG_KEYS.TRUST_BADGE_MIN_PHOTOS]: "5",
  [SYSTEM_CONFIG_KEYS.CHAT_AI_MODEL]: "gpt-4o-mini",
  [SYSTEM_CONFIG_KEYS.CHAT_BATCH_WINDOW_MS]: "5000",
  [SYSTEM_CONFIG_KEYS.CHAT_MAX_MESSAGE_LENGTH]: "2000",
  [SYSTEM_CONFIG_KEYS.CHAT_OWNER_INVITE_EXPIRY_DAYS]: "7",
  [SYSTEM_CONFIG_KEYS.CHAT_PII_FAIL_ACTION]: "admin_review",
  [SYSTEM_CONFIG_KEYS.NOTIFICATION_QUIET_HOURS_START]: "22:00",
  [SYSTEM_CONFIG_KEYS.NOTIFICATION_QUIET_HOURS_END]: "07:00",
  [SYSTEM_CONFIG_KEYS.NOTIFICATION_DEDUP_WINDOW_MS]: "300000",
  [SYSTEM_CONFIG_KEYS.NOTIFICATION_MAX_RETRIES]: "3",
  [SYSTEM_CONFIG_KEYS.NOTIFICATION_RETRY_BASE_MS]: "2000",
  [SYSTEM_CONFIG_KEYS.TRANSACTION_AUTO_CANCEL_DAYS]: "14",
  [SYSTEM_CONFIG_KEYS.KYC_PROVIDER_TIMEOUT_MS]: "45000",
  [SYSTEM_CONFIG_KEYS.ESIGN_DEADLINE_DAYS]: "5",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ACTIVE_CONFIG_VERSION]: "v3.0.0",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS]:
    '{"shadow_mode":true,"split_preview_enabled":true,"disbursement_enabled":false,"gamification_enabled":false}',
  [SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY]:
    '{"mode":"OFF","enabled_personas":[],"notes":"v2 remains payout source of truth"}',
  [SYSTEM_CONFIG_KEYS.INCENTIVE_V3_SHADOW_MODE_ENABLED]: "true",
  [SYSTEM_CONFIG_KEYS.INCENTIVE_V3_DECOMMISSION_VARIANCE_THRESHOLD]: "5",
  [SYSTEM_CONFIG_KEYS.OPS_FIELD_WORKER_ENABLED]: "false",
  [SYSTEM_CONFIG_KEYS.OPS_FIELD_WORKER_CANARY_USER_IDS]: "[]",
  [SYSTEM_CONFIG_KEYS.DEFAULT_UNASSIGNED_SOCIETY_ID]: "",
  [SYSTEM_CONFIG_KEYS.MULTI_PERSONA_ENABLED]: "false",
  [SYSTEM_CONFIG_KEYS.WARNING_QUALITY_THRESHOLD]: "40",
  [SYSTEM_CONFIG_KEYS.WARNING_TARGET_MISS_STREAK]: "3",
  [SYSTEM_CONFIG_KEYS.WARNING_SLA_BREACH_COUNT_30D]: "5",
  [SYSTEM_CONFIG_KEYS.WARNING_INACTIVITY_DAYS]: "7",
  [SYSTEM_CONFIG_KEYS.WARNING_LEVEL1_EXPIRY_DAYS]: "30",
  [SYSTEM_CONFIG_KEYS.WARNING_LEVEL2_EXPIRY_DAYS]: "60",
  [SYSTEM_CONFIG_KEYS.WARNING_ESCALATION_AUTO]: "true",
  [SYSTEM_CONFIG_KEYS.CHECKIN_OVERDUE_DAYS]: "7",
  [SYSTEM_CONFIG_KEYS.CASELOAD_THRESHOLD]: "15",
  [SYSTEM_CONFIG_KEYS.FEE_SLAB_LT_20K_PAISE]: "999900",
  [SYSTEM_CONFIG_KEYS.FEE_SLAB_BT_20K_40K_PAISE]: "1499900",
  [SYSTEM_CONFIG_KEYS.FEE_SLAB_BT_40K_80K_PAISE]: "2299900",
  [SYSTEM_CONFIG_KEYS.DISCOVERY_PASS_BASIC_PRICE_PAISE]: "99900",
  [SYSTEM_CONFIG_KEYS.DISCOVERY_PASS_BASIC_CREDIT_PAISE]: "150000",
  [SYSTEM_CONFIG_KEYS.DISCOVERY_PASS_PLUS_PRICE_PAISE]: "249900",
  [SYSTEM_CONFIG_KEYS.DISCOVERY_PASS_PLUS_CREDIT_PAISE]: "500000",
  [SYSTEM_CONFIG_KEYS.DISCOVERY_PASS_PREMIUM_PRICE_PAISE]: "499900",
  [SYSTEM_CONFIG_KEYS.DISCOVERY_PASS_PREMIUM_CREDIT_PAISE]: "1200000",
  [SYSTEM_CONFIG_KEYS.DISCOVERY_PASS_VALIDITY_DAYS]: "180",
  [SYSTEM_CONFIG_KEYS.PROMOTION_7D_PRICE_PAISE]: "99900",
  [SYSTEM_CONFIG_KEYS.PROMOTION_14D_PRICE_PAISE]: "179900",
  [SYSTEM_CONFIG_KEYS.PROMOTION_30D_PRICE_PAISE]: "299900",
  [SYSTEM_CONFIG_KEYS.PROMOTED_LISTINGS_MAX_PER_PAGE]: "3",
  [SYSTEM_CONFIG_KEYS.PROMOTED_LISTINGS_SLOTS]: "[1,5,9]",
} as const satisfies Record<SystemConfigKey, string>;

export const OPS_AGENT_PERMISSIONS = [
  PERMISSIONS.SOCIETIES_VIEW,
  PERMISSIONS.BUILDINGS_VIEW,
  PERMISSIONS.GUARDS_VIEW,
  PERMISSIONS.GUARDS_MANAGE_SHIFTS,
  PERMISSIONS.LEADS_VIEW,
  PERMISSIONS.LEADS_REQUEST_INFO,
  PERMISSIONS.LEADS_VERIFY,
  PERMISSIONS.LEADS_REJECT,
  PERMISSIONS.LEADS_MARK_DUPLICATE,
  PERMISSIONS.LEADS_SET_BOUNTY,
  PERMISSIONS.LISTINGS_VIEW,
  PERMISSIONS.LISTINGS_CREATE,
  PERMISSIONS.LISTINGS_EDIT,
  PERMISSIONS.LISTINGS_PUBLISH,
  PERMISSIONS.LISTINGS_VIEW_INQUIRIES,
  PERMISSIONS.TRUST_BADGES_VIEW,
  PERMISSIONS.VISITS_VIEW,
  PERMISSIONS.VISITS_CREATE,
  PERMISSIONS.VISITS_EDIT,
  PERMISSIONS.VISITS_CANCEL,
  PERMISSIONS.CLOSURES_VIEW,
  PERMISSIONS.CLOSURES_CREATE,
  PERMISSIONS.CLOSURES_EDIT,
  PERMISSIONS.PAYOUTS_VIEW,
  PERMISSIONS.INCENTIVES_VIEW,
  PERMISSIONS.COMMISSION_VIEW,
  PERMISSIONS.ATTRIBUTION_VIEW,
  PERMISSIONS.GAMIFICATION_VIEW,
  PERMISSIONS.SHADOW_MODE_VIEW,
  PERMISSIONS.QUALITY_VIEW,
  PERMISSIONS.ANALYTICS_VIEW,
  PERMISSIONS.TENANT_INQUIRIES_VIEW,
  PERMISSIONS.TENANT_INQUIRIES_MANAGE,
  PERMISSIONS.NEGOTIATIONS_VIEW,
  PERMISSIONS.NEGOTIATIONS_MANAGE,
  PERMISSIONS.TRANSACTIONS_VIEW,
  PERMISSIONS.TRANSACTIONS_MANAGE,
  PERMISSIONS.KYC_VERIFY,
  PERMISSIONS.AGREEMENTS_GENERATE,
  PERMISSIONS.AGREEMENTS_SIGN,
  PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW,
  PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE,
  PERMISSIONS.NOTIFICATIONS_VIEW,
] as const satisfies readonly Permission[];

export const AMENITIES = [
  "gym",
  "pool",
  "garden",
  "security",
  "lift",
  "power_backup",
  "clubhouse",
  "parking",
  "play_area",
  "jogging_track",
  "intercom",
  "cctv",
  "fire_safety",
  "water_supply_24x7",
  "gas_pipeline",
  "rain_water_harvesting",
] as const;

export const LEAD_STATUS_COLORS = {
  [LEAD_STATUS.SUBMITTED]: "bg-blue-100 text-blue-700",
  [LEAD_STATUS.NEED_INFO]: "bg-amber-100 text-amber-700",
  [LEAD_STATUS.POTENTIAL_DUPLICATE]: "bg-yellow-100 text-yellow-700",
  [LEAD_STATUS.VERIFIED]: "bg-green-100 text-green-700",
  [LEAD_STATUS.REJECTED]: "bg-red-100 text-red-700",
  [LEAD_STATUS.DUPLICATE]: "bg-gray-100 text-gray-500",
} as const satisfies Record<LeadStatus, string>;

export const VISIT_STATUS_COLORS = {
  [VISIT_STATUS.ASSIGNED]: "bg-blue-100 text-blue-700",
  [VISIT_STATUS.CONFIRMED]: "bg-indigo-100 text-indigo-700",
  [VISIT_STATUS.IN_PROGRESS]: "bg-amber-100 text-amber-700",
  [VISIT_STATUS.COMPLETED]: "bg-green-100 text-green-700",
  [VISIT_STATUS.CANCELLED]: "bg-gray-100 text-gray-500",
  [VISIT_STATUS.NO_SHOW]: "bg-red-100 text-red-700",
} as const satisfies Record<VisitStatus, string>;

export const LISTING_STATUS_COLORS = {
  [LISTING_STATUS.DRAFT]: "bg-gray-100 text-gray-600",
  [LISTING_STATUS.PUBLISHED]: "bg-green-100 text-green-700",
  [LISTING_STATUS.ARCHIVED]: "bg-gray-100 text-gray-500",
} as const satisfies Record<ListingStatus, string>;

export const FRESHNESS_STATE_COLORS = {
  [FRESHNESS_STATE.FRESH]: "bg-emerald-100 text-emerald-700",
  [FRESHNESS_STATE.AGING]: "bg-amber-100 text-amber-700",
  [FRESHNESS_STATE.STALE]: "bg-red-100 text-red-700",
} as const satisfies Record<FreshnessState, string>;

export const TRUST_BADGE_CONFIG: Record<
  TrustBadgeType,
  { label: string; color: string; iconName: string; priority: number }
> = {
  OWNER_VERIFIED: {
    label: "Owner Verified",
    color: "bg-emerald-50 text-emerald-700",
    iconName: "ShieldCheck",
    priority: 1,
  },
  PHYSICALLY_INSPECTED: {
    label: "Inspected",
    color: "bg-blue-50 text-blue-700",
    iconName: "ClipboardCheck",
    priority: 2,
  },
  FRESH_LISTING: {
    label: "Fresh",
    color: "bg-amber-50 text-amber-700",
    iconName: "Clock",
    priority: 3,
  },
  REAL_PHOTOS: {
    label: "Real Photos",
    color: "bg-purple-50 text-purple-700",
    iconName: "Camera",
    priority: 4,
  },
  VISITS_COMPLETED: {
    label: "Visited",
    color: "bg-indigo-50 text-indigo-700",
    iconName: "Users",
    priority: 5,
  },
  CLOSURE_HISTORY: {
    label: "Deal History",
    color: "bg-orange-50 text-orange-700",
    iconName: "Trophy",
    priority: 6,
  },
};

export const CLOSURE_STATUS_COLORS = {
  [CLOSURE_STATUS.PENDING]: "bg-amber-100 text-amber-700",
  [CLOSURE_STATUS.CONFIRMED]: "bg-green-100 text-green-700",
  [CLOSURE_STATUS.CANCELLED]: "bg-red-100 text-red-700",
} as const satisfies Record<ClosureStatus, string>;

export const TENANT_INQUIRY_STATUS_COLORS = {
  [TENANT_INQUIRY_STATUS.SUBMITTED]: "bg-blue-100 text-blue-700",
  [TENANT_INQUIRY_STATUS.REVIEWED]: "bg-indigo-100 text-indigo-700",
  [TENANT_INQUIRY_STATUS.BOUNTY_POSTED]: "bg-amber-100 text-amber-700",
  [TENANT_INQUIRY_STATUS.GUARD_ACCEPTED]: "bg-cyan-100 text-cyan-700",
  [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED]: "bg-purple-100 text-purple-700",
  [TENANT_INQUIRY_STATUS.VISIT_COMPLETED]: "bg-green-100 text-green-700",
  [TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED]: "bg-orange-100 text-orange-700",
  [TENANT_INQUIRY_STATUS.CLOSED]: "bg-gray-100 text-gray-500",
  [TENANT_INQUIRY_STATUS.REJECTED]: "bg-red-100 text-red-700",
  [TENANT_INQUIRY_STATUS.EXPIRED]: "bg-gray-100 text-gray-400",
} as const satisfies Record<TenantInquiryStatus, string>;

export const TRANSACTION_STATUS_COLORS: Record<TransactionStatus, string> = {
  [TRANSACTION_STATUS.INITIATED]: "bg-slate-100 text-slate-700",
  [TRANSACTION_STATUS.KYC_PENDING]: "bg-amber-100 text-amber-700",
  [TRANSACTION_STATUS.KYC_VERIFIED]: "bg-emerald-100 text-emerald-700",
  [TRANSACTION_STATUS.KYC_REJECTED]: "bg-red-100 text-red-700",
  [TRANSACTION_STATUS.AGREEMENT_PENDING]: "bg-indigo-100 text-indigo-700",
  [TRANSACTION_STATUS.AGREEMENT_SENT]: "bg-blue-100 text-blue-700",
  [TRANSACTION_STATUS.AGREEMENT_SIGNED]: "bg-green-100 text-green-700",
  [TRANSACTION_STATUS.TOKEN_PENDING]: "bg-orange-100 text-orange-700",
  [TRANSACTION_STATUS.TOKEN_RECEIVED]: "bg-orange-200 text-orange-800",
  [TRANSACTION_STATUS.DEPOSIT_PENDING]: "bg-cyan-100 text-cyan-700",
  [TRANSACTION_STATUS.DEPOSIT_RECEIVED]: "bg-cyan-200 text-cyan-800",
  [TRANSACTION_STATUS.MOVE_IN_SCHEDULED]: "bg-purple-100 text-purple-700",
  [TRANSACTION_STATUS.COMPLETED]: "bg-green-200 text-green-800",
  [TRANSACTION_STATUS.CANCELLED]: "bg-gray-100 text-gray-500",
};

export const NEGOTIATION_STATUS_COLORS: Record<NegotiationStatus, string> = {
  [NEGOTIATION_STATUS.INITIATED]: "bg-slate-100 text-slate-700",
  [NEGOTIATION_STATUS.ACTIVE]: "bg-blue-100 text-blue-700",
  [NEGOTIATION_STATUS.TERMS_PROPOSED]: "bg-indigo-100 text-indigo-700",
  [NEGOTIATION_STATUS.COUNTER_PROPOSED]: "bg-purple-100 text-purple-700",
  [NEGOTIATION_STATUS.TERMS_AGREED]: "bg-emerald-100 text-emerald-700",
  [NEGOTIATION_STATUS.TOKEN_COLLECTED]: "bg-cyan-100 text-cyan-700",
  [NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS]: "bg-amber-100 text-amber-700",
  [NEGOTIATION_STATUS.READY_FOR_CLOSURE]: "bg-green-100 text-green-700",
  [NEGOTIATION_STATUS.CLOSED]: "bg-green-200 text-green-800",
  [NEGOTIATION_STATUS.FAILED]: "bg-red-100 text-red-700",
  [NEGOTIATION_STATUS.STALLED]: "bg-orange-100 text-orange-700",
  [NEGOTIATION_STATUS.EXPIRED]: "bg-gray-100 text-gray-500",
};

export const NEGOTIATION_PROPOSAL_STATUS_COLORS: Record<NegotiationProposalStatus, string> = {
  [NEGOTIATION_PROPOSAL_STATUS.DRAFT]: "bg-gray-100 text-gray-600",
  [NEGOTIATION_PROPOSAL_STATUS.SHARED]: "bg-blue-100 text-blue-700",
  [NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED]: "bg-green-100 text-green-700",
  [NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED]: "bg-gray-100 text-gray-500",
};

export const TOKEN_RECORD_STATUS_COLORS: Record<TokenRecordStatus, string> = {
  [TOKEN_RECORD_STATUS.PENDING]: "bg-amber-100 text-amber-700",
  [TOKEN_RECORD_STATUS.COLLECTED]: "bg-blue-100 text-blue-700",
  [TOKEN_RECORD_STATUS.REFUNDED]: "bg-green-100 text-green-700",
  [TOKEN_RECORD_STATUS.FORFEITED]: "bg-red-100 text-red-700",
  [TOKEN_RECORD_STATUS.DISPUTED]: "bg-orange-100 text-orange-700",
};

export const NEGOTIATION_CHECKLIST_ITEM_STATUS_COLORS: Record<
  NegotiationChecklistItemStatus,
  string
> = {
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING]: "bg-gray-100 text-gray-600",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.IN_PROGRESS]: "bg-blue-100 text-blue-700",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED]: "bg-green-100 text-green-700",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.OBTAINED]: "bg-cyan-100 text-cyan-700",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.VERIFIED]: "bg-emerald-100 text-emerald-700",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.STAMP_REGISTERED]: "bg-indigo-100 text-indigo-700",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.DRAFT_READY]: "bg-purple-100 text-purple-700",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED]: "bg-yellow-100 text-yellow-700",
};

export const CHAT_MESSAGE_STATUS_COLORS = {
  [CHAT_MESSAGE_STATUS.SUBMITTED]: "bg-blue-100 text-blue-700",
  [CHAT_MESSAGE_STATUS.BATCHED]: "bg-indigo-100 text-indigo-700",
  [CHAT_MESSAGE_STATUS.PROCESSING]: "bg-amber-100 text-amber-700",
  [CHAT_MESSAGE_STATUS.DELIVERED]: "bg-green-100 text-green-700",
  [CHAT_MESSAGE_STATUS.FAILED]: "bg-red-100 text-red-700",
} as const satisfies Record<ChatMessageStatus, string>;

export const CHAT_BATCH_STATUS_COLORS = {
  [CHAT_BATCH_STATUS.COLLECTING]: "bg-blue-100 text-blue-700",
  [CHAT_BATCH_STATUS.PROCESSING]: "bg-amber-100 text-amber-700",
  [CHAT_BATCH_STATUS.DELIVERED]: "bg-green-100 text-green-700",
  [CHAT_BATCH_STATUS.FAILED]: "bg-red-100 text-red-700",
} as const satisfies Record<ChatBatchStatus, string>;

export const DEAL_CHECKLIST_STATUS_COLORS = {
  [DEAL_CHECKLIST_STATUS.DRAFT]: "bg-gray-100 text-gray-600",
  [DEAL_CHECKLIST_STATUS.SHARED]: "bg-blue-100 text-blue-700",
  [DEAL_CHECKLIST_STATUS.IN_REVIEW]: "bg-yellow-100 text-yellow-700",
  [DEAL_CHECKLIST_STATUS.APPROVED]: "bg-green-100 text-green-700",
  [DEAL_CHECKLIST_STATUS.DISPUTED]: "bg-red-100 text-red-700",
  [DEAL_CHECKLIST_STATUS.SUPERSEDED]: "bg-gray-100 text-gray-500",
} as const satisfies Record<DealChecklistStatus, string>;

export const OWNER_INVITE_STATUS_COLORS = {
  [OWNER_INVITE_STATUS.PENDING]: "bg-yellow-100 text-yellow-700",
  [OWNER_INVITE_STATUS.CONSUMED]: "bg-green-100 text-green-700",
  [OWNER_INVITE_STATUS.EXPIRED]: "bg-gray-100 text-gray-500",
  [OWNER_INVITE_STATUS.REGENERATED]: "bg-blue-100 text-blue-700",
} as const satisfies Record<OwnerInviteStatus, string>;

export const OWNER_SERVICE_REQUEST_STATUS_COLORS: Record<OwnerServiceRequestStatus, string> = {
  [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]: "bg-blue-100 text-blue-700",
  [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]: "bg-indigo-100 text-indigo-700",
  [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]: "bg-green-100 text-green-700",
  [OWNER_SERVICE_REQUEST_STATUS.ACTIVE]: "bg-emerald-100 text-emerald-700",
  [OWNER_SERVICE_REQUEST_STATUS.REJECTED]: "bg-red-100 text-red-700",
  [OWNER_SERVICE_REQUEST_STATUS.DROPPED]: "bg-gray-100 text-gray-500",
};

export const SUPPORT_INQUIRY_STATUS_COLORS: Record<SupportInquiryStatus, string> = {
  [SUPPORT_INQUIRY_STATUS.OPEN]: "bg-blue-100 text-blue-700",
  [SUPPORT_INQUIRY_STATUS.IN_PROGRESS]: "bg-amber-100 text-amber-700",
  [SUPPORT_INQUIRY_STATUS.RESOLVED]: "bg-green-100 text-green-700",
  [SUPPORT_INQUIRY_STATUS.CLOSED]: "bg-gray-100 text-gray-500",
};

export const VISIT_BOUNTY_STATUS_COLORS = {
  [VISIT_BOUNTY_STATUS.POSTED]: "bg-amber-100 text-amber-700",
  [VISIT_BOUNTY_STATUS.CLAIMED]: "bg-cyan-100 text-cyan-700",
  [VISIT_BOUNTY_STATUS.EXPIRED]: "bg-gray-100 text-gray-400",
  [VISIT_BOUNTY_STATUS.COMPLETED]: "bg-green-100 text-green-700",
} as const satisfies Record<VisitBountyStatus, string>;

export const TENANT_INQUIRY_STATUS_LABELS: Record<TenantInquiryStatus, string> = {
  [TENANT_INQUIRY_STATUS.SUBMITTED]: "Submitted",
  [TENANT_INQUIRY_STATUS.REVIEWED]: "Reviewed",
  [TENANT_INQUIRY_STATUS.BOUNTY_POSTED]: "Bounty Posted",
  [TENANT_INQUIRY_STATUS.GUARD_ACCEPTED]: "Guard Accepted",
  [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED]: "Visit Scheduled",
  [TENANT_INQUIRY_STATUS.VISIT_COMPLETED]: "Visit Completed",
  [TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED]: "Negotiation",
  [TENANT_INQUIRY_STATUS.CLOSED]: "Closed",
  [TENANT_INQUIRY_STATUS.REJECTED]: "Rejected",
  [TENANT_INQUIRY_STATUS.EXPIRED]: "Expired",
};

export const NEGOTIATION_STATUS_LABELS: Record<NegotiationStatus, string> = {
  [NEGOTIATION_STATUS.INITIATED]: "Initiated",
  [NEGOTIATION_STATUS.ACTIVE]: "Active",
  [NEGOTIATION_STATUS.TERMS_PROPOSED]: "Terms Proposed",
  [NEGOTIATION_STATUS.COUNTER_PROPOSED]: "Counter Proposed",
  [NEGOTIATION_STATUS.TERMS_AGREED]: "Terms Agreed",
  [NEGOTIATION_STATUS.TOKEN_COLLECTED]: "Token Collected",
  [NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS]: "Documentation In Progress",
  [NEGOTIATION_STATUS.READY_FOR_CLOSURE]: "Ready For Closure",
  [NEGOTIATION_STATUS.CLOSED]: "Closed",
  [NEGOTIATION_STATUS.FAILED]: "Failed",
  [NEGOTIATION_STATUS.STALLED]: "Stalled",
  [NEGOTIATION_STATUS.EXPIRED]: "Expired",
};

export const NEGOTIATION_PROPOSAL_STATUS_LABELS: Record<NegotiationProposalStatus, string> = {
  [NEGOTIATION_PROPOSAL_STATUS.DRAFT]: "Draft",
  [NEGOTIATION_PROPOSAL_STATUS.SHARED]: "Shared",
  [NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED]: "Both Agreed",
  [NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED]: "Superseded",
};

export const TOKEN_RECORD_STATUS_LABELS: Record<TokenRecordStatus, string> = {
  [TOKEN_RECORD_STATUS.PENDING]: "Pending",
  [TOKEN_RECORD_STATUS.COLLECTED]: "Collected",
  [TOKEN_RECORD_STATUS.REFUNDED]: "Refunded",
  [TOKEN_RECORD_STATUS.FORFEITED]: "Forfeited",
  [TOKEN_RECORD_STATUS.DISPUTED]: "Disputed",
};

export const NEGOTIATION_CHECKLIST_ITEM_STATUS_LABELS: Record<
  NegotiationChecklistItemStatus,
  string
> = {
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING]: "Pending",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.IN_PROGRESS]: "In Progress",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED]: "Completed",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.OBTAINED]: "Obtained",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.VERIFIED]: "Verified",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.STAMP_REGISTERED]: "Stamp Registered",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.DRAFT_READY]: "Draft Ready",
  [NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED]: "Waived",
};

export const CHAT_MESSAGE_STATUS_LABELS: Record<ChatMessageStatus, string> = {
  [CHAT_MESSAGE_STATUS.SUBMITTED]: "Submitted",
  [CHAT_MESSAGE_STATUS.BATCHED]: "Batched",
  [CHAT_MESSAGE_STATUS.PROCESSING]: "Processing",
  [CHAT_MESSAGE_STATUS.DELIVERED]: "Delivered",
  [CHAT_MESSAGE_STATUS.FAILED]: "Failed",
};

export const CHAT_BATCH_STATUS_LABELS: Record<ChatBatchStatus, string> = {
  [CHAT_BATCH_STATUS.COLLECTING]: "Collecting",
  [CHAT_BATCH_STATUS.PROCESSING]: "Processing",
  [CHAT_BATCH_STATUS.DELIVERED]: "Delivered",
  [CHAT_BATCH_STATUS.FAILED]: "Failed",
};

export const CHAT_CHANNEL_STATUS_LABELS: Record<ChatChannelStatus, string> = {
  [CHAT_CHANNEL_STATUS.ACTIVE]: "Active",
  [CHAT_CHANNEL_STATUS.ARCHIVED]: "Archived",
};

export const CHAT_SENDER_ROLE_LABELS: Record<ChatSenderRole, string> = {
  [CHAT_SENDER_ROLE.TENANT]: "Tenant",
  [CHAT_SENDER_ROLE.OWNER]: "Owner",
  [CHAT_SENDER_ROLE.OPS]: "OPS",
  [CHAT_SENDER_ROLE.SYSTEM]: "System",
};

export const DEAL_CHECKLIST_STATUS_LABELS: Record<DealChecklistStatus, string> = {
  [DEAL_CHECKLIST_STATUS.DRAFT]: "Draft",
  [DEAL_CHECKLIST_STATUS.SHARED]: "Shared",
  [DEAL_CHECKLIST_STATUS.IN_REVIEW]: "In Review",
  [DEAL_CHECKLIST_STATUS.APPROVED]: "Approved",
  [DEAL_CHECKLIST_STATUS.DISPUTED]: "Disputed",
  [DEAL_CHECKLIST_STATUS.SUPERSEDED]: "Superseded",
};

export const OWNER_INVITE_STATUS_LABELS: Record<OwnerInviteStatus, string> = {
  [OWNER_INVITE_STATUS.PENDING]: "Pending",
  [OWNER_INVITE_STATUS.CONSUMED]: "Consumed",
  [OWNER_INVITE_STATUS.EXPIRED]: "Expired",
  [OWNER_INVITE_STATUS.REGENERATED]: "Regenerated",
};

export const OWNER_SERVICE_REQUEST_STATUS_LABELS: Record<OwnerServiceRequestStatus, string> = {
  [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]: "Submitted",
  [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]: "Contacted",
  [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]: "Onboarded",
  [OWNER_SERVICE_REQUEST_STATUS.ACTIVE]: "Active",
  [OWNER_SERVICE_REQUEST_STATUS.REJECTED]: "Rejected",
  [OWNER_SERVICE_REQUEST_STATUS.DROPPED]: "Dropped",
};

export const SUPPORT_INQUIRY_STATUS_LABELS: Record<SupportInquiryStatus, string> = {
  [SUPPORT_INQUIRY_STATUS.OPEN]: "Open",
  [SUPPORT_INQUIRY_STATUS.IN_PROGRESS]: "In Progress",
  [SUPPORT_INQUIRY_STATUS.RESOLVED]: "Resolved",
  [SUPPORT_INQUIRY_STATUS.CLOSED]: "Closed",
};

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVISION_REQUESTED: "Revision Requested",
};

export const CHECKLIST_DEPTH_LABELS: Record<ChecklistDepth, string> = {
  LIGHT: "Light",
  MEDIUM: "Medium",
  FULL: "Full",
};

export const CONDITION_RATING_LABELS: Record<ConditionRating, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  NA: "N/A",
};

export const DOCUMENT_REQUIREMENT_TYPE_LABELS: Record<DocumentRequirementType, string> = {
  [DOCUMENT_REQUIREMENT_TYPE.OWNER_DOCS]: "Owner Documents",
  [DOCUMENT_REQUIREMENT_TYPE.TENANT_DOCS]: "Tenant Documents",
  [DOCUMENT_REQUIREMENT_TYPE.SOCIETY_DOCS]: "Society Documents",
};

export const DOCUMENT_ITEM_STATUS_LABELS: Record<DocumentItemStatus, string> = {
  [DOCUMENT_ITEM_STATUS.PENDING]: "Pending",
  [DOCUMENT_ITEM_STATUS.COLLECTED]: "Collected",
  [DOCUMENT_ITEM_STATUS.VERIFIED]: "Verified",
  [DOCUMENT_ITEM_STATUS.REJECTED]: "Rejected",
  [DOCUMENT_ITEM_STATUS.NA]: "N/A",
};

export const DOCUMENT_OVERALL_STATUS_LABELS: Record<DocumentOverallStatus, string> = {
  [DOCUMENT_OVERALL_STATUS.NOT_STARTED]: "Not Started",
  [DOCUMENT_OVERALL_STATUS.IN_PROGRESS]: "In Progress",
  [DOCUMENT_OVERALL_STATUS.COMPLETE]: "Complete",
  [DOCUMENT_OVERALL_STATUS.BLOCKED]: "Blocked",
};

export const REGULATORY_ITEM_TYPE_LABELS: Record<RegulatoryItemType, string> = {
  [REGULATORY_ITEM_TYPE.POLICE_VERIFICATION]: "Police Verification",
  [REGULATORY_ITEM_TYPE.RENT_REGISTRATION]: "Rent Registration",
  [REGULATORY_ITEM_TYPE.SOCIETY_NOC]: "Society NOC",
  [REGULATORY_ITEM_TYPE.STAMP_DUTY]: "Stamp Duty",
};

export const REGULATORY_STATUS_LABELS: Record<RegulatoryStatus, string> = {
  [REGULATORY_STATUS.NOT_STARTED]: "Not Started",
  [REGULATORY_STATUS.IN_PROGRESS]: "In Progress",
  [REGULATORY_STATUS.SUBMITTED]: "Submitted",
  [REGULATORY_STATUS.APPROVED]: "Approved",
  [REGULATORY_STATUS.REJECTED]: "Rejected",
  [REGULATORY_STATUS.OVERDUE]: "Overdue",
  [REGULATORY_STATUS.WAIVED]: "Waived",
};

export const OWNER_LIFECYCLE_STAGE_COLORS: Record<OwnerLifecycleStage, string> = {
  [OWNER_LIFECYCLE_STAGE.PROSPECT]: "bg-slate-100 text-slate-600",
  [OWNER_LIFECYCLE_STAGE.VERIFIED]: "bg-blue-100 text-blue-700",
  [OWNER_LIFECYCLE_STAGE.ACTIVE]: "bg-green-100 text-green-700",
  [OWNER_LIFECYCLE_STAGE.MANAGED]: "bg-indigo-100 text-indigo-700",
  [OWNER_LIFECYCLE_STAGE.DORMANT]: "bg-amber-100 text-amber-700",
  [OWNER_LIFECYCLE_STAGE.CHURNED]: "bg-red-100 text-red-700",
};

export const RM_ASSIGNMENT_STATUS_COLORS: Record<RmAssignmentStatus, string> = {
  [RM_ASSIGNMENT_STATUS.ACTIVE]: "bg-green-100 text-green-700",
  [RM_ASSIGNMENT_STATUS.WARNING]: "bg-amber-100 text-amber-700",
  [RM_ASSIGNMENT_STATUS.ESCALATED]: "bg-red-100 text-red-700",
  [RM_ASSIGNMENT_STATUS.REASSIGNED]: "bg-slate-100 text-slate-500",
  [RM_ASSIGNMENT_STATUS.ENDED]: "bg-gray-100 text-gray-500",
};

export const RM_CHECK_IN_TYPE_LABELS: Record<RmCheckInType, string> = {
  [RM_CHECK_IN_TYPE.SCHEDULED]: "Scheduled",
  [RM_CHECK_IN_TYPE.ISSUE]: "Issue",
  [RM_CHECK_IN_TYPE.RE_LISTING]: "Re-listing",
  [RM_CHECK_IN_TYPE.OWNER_INITIATED]: "Owner Initiated",
  [RM_CHECK_IN_TYPE.AD_HOC]: "Ad Hoc",
};

export const RM_CHECK_IN_METHOD_LABELS: Record<RmCheckInMethod, string> = {
  [RM_CHECK_IN_METHOD.CALL]: "Call",
  [RM_CHECK_IN_METHOD.WHATSAPP]: "WhatsApp",
  [RM_CHECK_IN_METHOD.IN_PERSON]: "In Person",
  [RM_CHECK_IN_METHOD.OTHER]: "Other",
};

export const RM_CHECK_IN_OUTCOME_LABELS: Record<RmCheckInOutcome, string> = {
  [RM_CHECK_IN_OUTCOME.RESOLVED]: "Resolved",
  [RM_CHECK_IN_OUTCOME.PENDING]: "Pending",
  [RM_CHECK_IN_OUTCOME.ESCALATED]: "Escalated",
};

export const RM_CHECK_IN_OUTCOME_COLORS: Record<RmCheckInOutcome, string> = {
  [RM_CHECK_IN_OUTCOME.RESOLVED]: "bg-green-100 text-green-700",
  [RM_CHECK_IN_OUTCOME.PENDING]: "bg-amber-100 text-amber-700",
  [RM_CHECK_IN_OUTCOME.ESCALATED]: "bg-red-100 text-red-700",
};

export const PAYOUT_STATUS_COLORS = {
  [PAYOUT_STATUS.PENDING]: "bg-blue-100 text-blue-700",
  [PAYOUT_STATUS.APPROVED]: "bg-indigo-100 text-indigo-700",
  [PAYOUT_STATUS.DISBURSED]: "bg-green-100 text-green-700",
  [PAYOUT_STATUS.FAILED]: "bg-red-100 text-red-700",
  [PAYOUT_STATUS.VOIDED]: "bg-gray-100 text-gray-500",
} as const satisfies Record<PayoutStatus, string>;

export const REFERRAL_STATUS_COLORS = {
  [REFERRAL_STATUS.PENDING]: "bg-blue-100 text-blue-700",
  [REFERRAL_STATUS.QUALIFIED]: "bg-emerald-100 text-emerald-700",
  [REFERRAL_STATUS.PARTIALLY_PAID]: "bg-amber-100 text-amber-700",
  [REFERRAL_STATUS.FULLY_PAID]: "bg-green-100 text-green-700",
  [REFERRAL_STATUS.VOIDED]: "bg-red-100 text-red-700",
} as const satisfies Record<ReferralStatus, string>;

export const REFERRAL_MILESTONE_STATUS_COLORS = {
  [REFERRAL_MILESTONE_STATUS.PENDING]: "bg-slate-100 text-slate-700",
  [REFERRAL_MILESTONE_STATUS.TRIGGERED]: "bg-blue-100 text-blue-700",
  [REFERRAL_MILESTONE_STATUS.APPROVED]: "bg-emerald-100 text-emerald-700",
  [REFERRAL_MILESTONE_STATUS.PAID]: "bg-green-100 text-green-700",
  [REFERRAL_MILESTONE_STATUS.VOIDED]: "bg-red-100 text-red-700",
} as const satisfies Record<ReferralMilestoneStatus, string>;

const LEAD_SLA_WINDOW_MS = 24 * 60 * 60 * 1000;
const VISIT_SLA_WINDOW_MS = 48 * 60 * 60 * 1000;
const PAYOUT_SLA_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
const SLA_WARNING_THRESHOLD = 0.75;

export const SLA_STATUS = {
  ON_TRACK: "ON_TRACK",
  WARNING: "WARNING",
  BREACHED: "BREACHED",
} as const satisfies Record<string, string>;

export type SLAStatus = (typeof SLA_STATUS)[keyof typeof SLA_STATUS];

export type SLAPolicy = {
  entity: "lead" | "visit" | "payout";
  label: string;
  windowMs: number;
  warningThreshold: number;
};

export const SLA_POLICIES: Record<"lead" | "visit" | "payout", SLAPolicy> = {
  lead: {
    entity: "lead",
    label: "Lead verification",
    windowMs: LEAD_SLA_WINDOW_MS,
    warningThreshold: SLA_WARNING_THRESHOLD,
  },
  visit: {
    entity: "visit",
    label: "Visit scheduling",
    windowMs: VISIT_SLA_WINDOW_MS,
    warningThreshold: SLA_WARNING_THRESHOLD,
  },
  payout: {
    entity: "payout",
    label: "Payout processing",
    windowMs: PAYOUT_SLA_WINDOW_MS,
    warningThreshold: SLA_WARNING_THRESHOLD,
  },
};
