import { v } from "convex/values";
import { internalMutation } from "./functions";

export const backfillUserPersonas = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("users")
      .order("asc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: 100,
      });

    let scanned = 0;
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of page) {
      scanned += 1;

      if (user.user_types != null) {
        skipped += 1;
        continue;
      }

      try {
        await ctx.db.patch(user._id, {
          user_types: [user.user_type],
          active_persona: user.user_type,
        });
        created += 1;
      } catch {
        errors += 1;
      }
    }

    return {
      scanned,
      created,
      skipped,
      errors,
      isDone,
      continueCursor,
    };
  },
});
