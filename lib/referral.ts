import {
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_STATUS,
  type ReferralMilestoneStatus,
  type ReferralStatus,
} from "./constants";

const REFERRAL_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const REFERRAL_TRANSITIONS: Record<ReferralStatus, readonly ReferralStatus[]> = {
  [REFERRAL_STATUS.PENDING]: [REFERRAL_STATUS.QUALIFIED, REFERRAL_STATUS.VOIDED],
  [REFERRAL_STATUS.QUALIFIED]: [
    REFERRAL_STATUS.PARTIALLY_PAID,
    REFERRAL_STATUS.FULLY_PAID,
    REFERRAL_STATUS.VOIDED,
  ],
  [REFERRAL_STATUS.PARTIALLY_PAID]: [REFERRAL_STATUS.FULLY_PAID, REFERRAL_STATUS.VOIDED],
  [REFERRAL_STATUS.FULLY_PAID]: [],
  [REFERRAL_STATUS.VOIDED]: [],
};

const REFERRAL_MILESTONE_TRANSITIONS: Record<
  ReferralMilestoneStatus,
  readonly ReferralMilestoneStatus[]
> = {
  [REFERRAL_MILESTONE_STATUS.PENDING]: [
    REFERRAL_MILESTONE_STATUS.TRIGGERED,
    REFERRAL_MILESTONE_STATUS.VOIDED,
  ],
  [REFERRAL_MILESTONE_STATUS.TRIGGERED]: [
    REFERRAL_MILESTONE_STATUS.APPROVED,
    REFERRAL_MILESTONE_STATUS.VOIDED,
  ],
  [REFERRAL_MILESTONE_STATUS.APPROVED]: [
    REFERRAL_MILESTONE_STATUS.PAID,
    REFERRAL_MILESTONE_STATUS.VOIDED,
  ],
  [REFERRAL_MILESTONE_STATUS.PAID]: [],
  [REFERRAL_MILESTONE_STATUS.VOIDED]: [],
};

export function generateReferralCode(): string {
  let code = "";

  for (let i = 0; i < 5; i += 1) {
    const index = Math.floor(Math.random() * REFERRAL_CODE_CHARS.length);
    code += REFERRAL_CODE_CHARS[index];
  }

  return `FLAT-${code}`;
}

export function validateReferralTransition(from: ReferralStatus, to: ReferralStatus): boolean {
  return REFERRAL_TRANSITIONS[from].includes(to);
}

export function validateMilestoneTransition(
  from: ReferralMilestoneStatus,
  to: ReferralMilestoneStatus,
): boolean {
  return REFERRAL_MILESTONE_TRANSITIONS[from].includes(to);
}

export function calculateSplitAmount(totalPaise: number, splitPct: number): number {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    throw new Error("totalPaise must be a non-negative integer");
  }

  if (!Number.isInteger(splitPct) || splitPct < 0 || splitPct > 100) {
    throw new Error("splitPct must be an integer between 0 and 100");
  }

  // Use Math.floor to avoid over-allocation by 1 paise when splits are calculated independently
  return Math.floor((totalPaise * splitPct) / 100);
}
