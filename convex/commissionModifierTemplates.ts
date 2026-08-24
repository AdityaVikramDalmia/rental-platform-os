import { v } from "convex/values";
import {
  COMMISSION_METRIC_SOURCE,
  INCENTIVE_PERSONA,
  MODIFIER_LINK_MODE,
  MODIFIER_REWARD_MODE,
  MODIFIER_RULE_TYPE,
  PERMISSIONS,
} from "../lib/constants";
import type { Doc } from "./_generated/dataModel";
import { requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

const modifierRewardModeValidator = v.union(
  v.literal(MODIFIER_REWARD_MODE.BPS),
  v.literal(MODIFIER_REWARD_MODE.FLAT_PAISE),
);

const modifierRuleTypeValidator = v.union(
  v.literal(MODIFIER_RULE_TYPE.THRESHOLD_STEP),
  v.literal(MODIFIER_RULE_TYPE.LINEAR_BAND),
  v.literal(MODIFIER_RULE_TYPE.PENALTY_STEP),
);

const modifierLinkModeValidator = v.union(
  v.literal(MODIFIER_LINK_MODE.INDIVIDUAL),
  v.literal(MODIFIER_LINK_MODE.AND_GROUP),
  v.literal(MODIFIER_LINK_MODE.OR_GROUP),
);

const commissionMetricSourceValidator = v.union(
  v.literal(COMMISSION_METRIC_SOURCE.AVG_DOC_PROCESSING_HOURS),
  v.literal(COMMISSION_METRIC_SOURCE.ON_TIME_VISIT_RATE),
  v.literal(COMMISSION_METRIC_SOURCE.AVG_CHECKLIST_SCORE),
  v.literal(COMMISSION_METRIC_SOURCE.RESPONSE_SPEED_HOURS),
  v.literal(COMMISSION_METRIC_SOURCE.COMPLETION_RATE),
  v.literal(COMMISSION_METRIC_SOURCE.PENALTY_COUNT),
  v.literal(COMMISSION_METRIC_SOURCE.CUSTOM),
);

type ModifierTemplateDoc = Doc<"commission_modifier_templates">;

const PERSONA_SORT_PRIORITY: Readonly<Record<ModifierTemplateDoc["persona"], number>> = {
  [INCENTIVE_PERSONA.ALL]: 0,
  [INCENTIVE_PERSONA.GUARD]: 1,
  [INCENTIVE_PERSONA.OPS]: 2,
  [INCENTIVE_PERSONA.SALES]: 3,
  [INCENTIVE_PERSONA.RM]: 4,
  [INCENTIVE_PERSONA.LIAISON]: 5,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function assertSortOrder(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("sort_order must be a non-negative integer");
  }
}

function normalizeLinkGroupId(
  linkMode: ModifierTemplateDoc["link_mode"],
  linkGroupId: string | undefined,
): string | undefined {
  if (linkMode === MODIFIER_LINK_MODE.INDIVIDUAL) {
    return undefined;
  }

  const normalized = normalizeOptionalString(linkGroupId);
  if (!normalized) {
    throw new Error("link_group_id is required when link_mode is grouped");
  }

  return normalized;
}

function getNumericField(
  source: Record<string, unknown>,
  fieldNames: string[],
): number | undefined {
  for (const fieldName of fieldNames) {
    const value = source[fieldName];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function assertRuleConfigShape(args: {
  rule_type: ModifierTemplateDoc["rule_type"];
  reward_mode: ModifierTemplateDoc["reward_mode"];
  rule_config_json: string;
}): string {
  const normalized = normalizeRequiredString(args.rule_config_json, "rule_config_json");
  let parsed: unknown;

  try {
    parsed = JSON.parse(normalized) as unknown;
  } catch {
    throw new Error("rule_config_json must be valid JSON");
  }

  if (!isRecord(parsed)) {
    throw new Error("rule_config_json must be a JSON object");
  }

  const threshold = getNumericField(parsed, ["threshold"]);
  const thresholdUpper = getNumericField(parsed, ["threshold_upper"]);
  const slopePerUnit = getNumericField(parsed, ["slope_per_unit"]);
  const deltaBps = getNumericField(parsed, ["delta_bps", "delta_value"]);
  const deltaPaise = getNumericField(parsed, ["delta_paise", "delta_value"]);

  if (
    args.rule_type === MODIFIER_RULE_TYPE.THRESHOLD_STEP ||
    args.rule_type === MODIFIER_RULE_TYPE.PENALTY_STEP
  ) {
    if (threshold === undefined) {
      throw new Error("rule_config_json.threshold is required for step rules");
    }

    if (args.reward_mode === MODIFIER_REWARD_MODE.BPS && deltaBps === undefined) {
      throw new Error("rule_config_json must provide delta_bps or delta_value for BPS mode");
    }

    if (args.reward_mode === MODIFIER_REWARD_MODE.FLAT_PAISE && deltaPaise === undefined) {
      throw new Error(
        "rule_config_json must provide delta_paise or delta_value for FLAT_PAISE mode",
      );
    }
  }

  if (args.rule_type === MODIFIER_RULE_TYPE.LINEAR_BAND) {
    if (threshold === undefined || thresholdUpper === undefined || slopePerUnit === undefined) {
      throw new Error(
        "rule_config_json must include threshold, threshold_upper, and slope_per_unit for linear_band",
      );
    }

    if (thresholdUpper <= threshold) {
      throw new Error("rule_config_json.threshold_upper must be greater than threshold");
    }
  }

  return JSON.stringify(parsed);
}

function sortTemplates(
  templates: ModifierTemplateDoc[],
  personaPriority: Readonly<Record<ModifierTemplateDoc["persona"], number>>,
): ModifierTemplateDoc[] {
  return templates.sort((a, b) => {
    const personaOrder = personaPriority[a.persona] - personaPriority[b.persona];
    if (personaOrder !== 0) {
      return personaOrder;
    }

    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }

    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }

    return a._creationTime - b._creationTime;
  });
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    persona: incentivePersonaValidator,
    reward_mode: modifierRewardModeValidator,
    rule_type: modifierRuleTypeValidator,
    metric_source: commissionMetricSourceValidator,
    rule_config_json: v.string(),
    link_mode: modifierLinkModeValidator,
    link_group_id: v.optional(v.string()),
    sort_order: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);
    assertSortOrder(args.sort_order);

    const now = Date.now();
    return await ctx.db.insert("commission_modifier_templates", {
      name: normalizeRequiredString(args.name, "name"),
      description: normalizeOptionalString(args.description),
      persona: args.persona,
      reward_mode: args.reward_mode,
      rule_type: args.rule_type,
      metric_source: args.metric_source,
      rule_config_json: assertRuleConfigShape({
        rule_type: args.rule_type,
        reward_mode: args.reward_mode,
        rule_config_json: args.rule_config_json,
      }),
      link_mode: args.link_mode,
      link_group_id: normalizeLinkGroupId(args.link_mode, args.link_group_id),
      is_active: true,
      sort_order: args.sort_order,
      created_by: admin._id,
      updated_by: undefined,
      created_at: now,
      updated_at: undefined,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("commission_modifier_templates"),
    name: v.string(),
    description: v.optional(v.string()),
    persona: incentivePersonaValidator,
    reward_mode: modifierRewardModeValidator,
    rule_type: modifierRuleTypeValidator,
    metric_source: commissionMetricSourceValidator,
    rule_config_json: v.string(),
    link_mode: modifierLinkModeValidator,
    link_group_id: v.optional(v.string()),
    sort_order: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const existingTemplate = await ctx.db.get(args.id);
    if (!existingTemplate) {
      throw new Error("Modifier template not found");
    }

    if (!existingTemplate.is_active) {
      throw new Error("Only active templates can be updated");
    }

    assertSortOrder(args.sort_order);

    await ctx.db.patch(existingTemplate._id, {
      name: normalizeRequiredString(args.name, "name"),
      description: normalizeOptionalString(args.description),
      persona: args.persona,
      reward_mode: args.reward_mode,
      rule_type: args.rule_type,
      metric_source: args.metric_source,
      rule_config_json: assertRuleConfigShape({
        rule_type: args.rule_type,
        reward_mode: args.reward_mode,
        rule_config_json: args.rule_config_json,
      }),
      link_mode: args.link_mode,
      link_group_id: normalizeLinkGroupId(args.link_mode, args.link_group_id),
      sort_order: args.sort_order,
      updated_by: admin._id,
      updated_at: Date.now(),
    });

    return await ctx.db.get(existingTemplate._id);
  },
});

export const archive = mutation({
  args: {
    id: v.id("commission_modifier_templates"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const existingTemplate = await ctx.db.get(args.id);
    if (!existingTemplate) {
      throw new Error("Modifier template not found");
    }

    if (!existingTemplate.is_active) {
      return existingTemplate;
    }

    await ctx.db.patch(existingTemplate._id, {
      is_active: false,
      updated_by: admin._id,
      updated_at: Date.now(),
    });

    return await ctx.db.get(existingTemplate._id);
  },
});

export const reactivate = mutation({
  args: {
    id: v.id("commission_modifier_templates"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const existingTemplate = await ctx.db.get(args.id);
    if (!existingTemplate) {
      throw new Error("Modifier template not found");
    }

    if (existingTemplate.is_active) {
      return existingTemplate;
    }

    await ctx.db.patch(existingTemplate._id, {
      is_active: true,
      updated_by: admin._id,
      updated_at: Date.now(),
    });

    return await ctx.db.get(existingTemplate._id);
  },
});

export const listByPersona = query({
  args: {
    persona: incentivePersonaValidator,
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const templates = await ctx.db.query("commission_modifier_templates").collect();
    const includeArchived = args.includeArchived ?? false;

    const filtered = templates.filter((template) => {
      const personaMatch =
        args.persona === INCENTIVE_PERSONA.ALL
          ? template.persona === INCENTIVE_PERSONA.ALL
          : template.persona === args.persona || template.persona === INCENTIVE_PERSONA.ALL;

      if (!personaMatch) {
        return false;
      }

      if (!includeArchived && !template.is_active) {
        return false;
      }

      return true;
    });

    return sortTemplates(filtered, PERSONA_SORT_PRIORITY);
  },
});

export const getById = query({
  args: {
    id: v.id("commission_modifier_templates"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);
    return await ctx.db.get(args.id);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const templates = await ctx.db.query("commission_modifier_templates").collect();
    const activeTemplates = templates.filter((template) => template.is_active);

    return sortTemplates(activeTemplates, PERSONA_SORT_PRIORITY);
  },
});
