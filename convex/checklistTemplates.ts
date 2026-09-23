import { v } from "convex/values";
import { CHECKLIST_DEPTH, USER_TYPE } from "../lib/constants";
import type { ChecklistTemplatePayload } from "../lib/checklists/property-inspection-templates";
import { requireAuth, requireBackoffice, requireGuard } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, query } from "./functions";

const checklistDepthValidator = v.union(
  v.literal(CHECKLIST_DEPTH.LIGHT),
  v.literal(CHECKLIST_DEPTH.MEDIUM),
  v.literal(CHECKLIST_DEPTH.FULL),
);

const checklistItemTypeValidator = v.union(
  v.literal("CONDITION"),
  v.literal("CHECKBOX"),
  v.literal("TEXT"),
  v.literal("NUMBER"),
  v.literal("PHOTO"),
  v.literal("PHOTO_CONDITION"),
);

const checklistTemplatePayloadValidator = v.object({
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
});

export async function upsertChecklistTemplateByDepth(
  ctx: MutationCtx,
  template: ChecklistTemplatePayload,
): Promise<Id<"checklist_templates">> {
  const normalizedName = template.name.trim();

  if (normalizedName.length === 0) {
    throw new Error("Template name is required");
  }

  const existingTemplate = await ctx.db
    .query("checklist_templates")
    .withIndex("by_name_and_depth", (q) => q.eq("name", normalizedName).eq("depth", template.depth))
    .first();

  if (existingTemplate) {
    await ctx.db.patch(existingTemplate._id, {
      name: normalizedName,
      description: template.description,
      is_active: template.is_active,
      is_deleted: template.is_deleted,
      sections: template.sections,
    });

    return existingTemplate._id;
  }

  return await ctx.db.insert("checklist_templates", {
    ...template,
    name: normalizedName,
  });
}

export const upsertTemplate = internalMutation({
  args: {
    template: checklistTemplatePayloadValidator,
  },
  handler: async (ctx, args) => {
    return await upsertChecklistTemplateByDepth(ctx, args.template);
  },
});

export const getByDepth = query({
  args: {
    depth: checklistDepthValidator,
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);

    return await ctx.db
      .query("checklist_templates")
      .withIndex("by_depth_and_active", (q) => q.eq("depth", args.depth).eq("is_active", true))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();
  },
});

function hasBackofficePersona(user: Doc<"users">): boolean {
  const personas = user.user_types ?? [user.user_type];
  return personas.includes(USER_TYPE.ADMIN) || personas.includes(USER_TYPE.OPS);
}

/** An active guard may read a template only through a live checklist assigned to them. */
async function requireGuardWithAssignedTemplate(
  ctx: QueryCtx,
  templateId: Id<"checklist_templates">,
): Promise<void> {
  const guard = await requireGuard(ctx);
  const assignedInstance = await ctx.db
    .query("checklist_instances")
    .withIndex("by_assigned_to", (q) => q.eq("assigned_to", guard._id))
    .filter((q) =>
      q.and(q.eq(q.field("template_id"), templateId), q.neq(q.field("is_deleted"), true)),
    )
    .first();

  if (!assignedInstance) {
    throw new Error("You can only access templates for checklists assigned to you");
  }
}

export const getById = query({
  args: { id: v.id("checklist_templates") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (hasBackofficePersona(user)) {
      await requireBackoffice(ctx);
    } else {
      await requireGuardWithAssignedTemplate(ctx, args.id);
    }

    const template = await ctx.db.get(args.id);
    if (!template || template.is_deleted) return null;
    return template;
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);

    const templates = await ctx.db
      .query("checklist_templates")
      .withIndex("by_is_active", (q) => q.eq("is_active", true))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const order: ReadonlyArray<(typeof CHECKLIST_DEPTH)[keyof typeof CHECKLIST_DEPTH]> = [
      CHECKLIST_DEPTH.LIGHT,
      CHECKLIST_DEPTH.MEDIUM,
      CHECKLIST_DEPTH.FULL,
    ];

    return templates.sort((a, b) => {
      const aOrder = order.indexOf(a.depth);
      const bOrder = order.indexOf(b.depth);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });
  },
});
