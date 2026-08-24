import type { Id } from "../../../../convex/_generated/dataModel";

export type OwnerChannelStatus = "ACTIVE" | "ARCHIVED";

export type OwnerChannelListRow = {
  channel_id: Id<"chat_channels">;
  inquiry_id: Id<"tenant_inquiries">;
  status: OwnerChannelStatus;
  listing_summary: {
    society_name: string | null;
    building_name: string | null;
    flat_number: string | null;
    slug: string | null;
  };
  last_message_preview: string | null;
  last_message_at: number;
  unread_count: number;
};
