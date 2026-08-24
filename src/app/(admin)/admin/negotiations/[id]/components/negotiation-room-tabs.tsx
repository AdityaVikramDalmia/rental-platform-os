"use client";

import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { NEGOTIATION_ROOM_TYPE } from "../../../../../../../lib/constants";
import { ChatView } from "@/components/chat/ChatView";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type NegotiationRoom = {
  _id: Id<"chat_channels">;
  channel_type?: string;
};

type NegotiationRoomTabsProps = {
  rooms: NegotiationRoom[];
  currentUserId: Id<"users">;
  currentUserRole: string;
};

function EmptyRoom({ label }: { label: string }) {
  return (
    <Card className="border-dashed border-slate-300 bg-slate-50 py-0">
      <CardContent className="px-5 py-8 text-center text-sm text-slate-600">
        {label} room is not available yet.
      </CardContent>
    </Card>
  );
}

export function NegotiationRoomTabs({
  rooms,
  currentUserId,
  currentUserRole,
}: NegotiationRoomTabsProps) {
  const opsTenantRoom =
    rooms.find((room) => room.channel_type === NEGOTIATION_ROOM_TYPE.OPS_TENANT) ?? null;
  const opsOwnerRoom =
    rooms.find((room) => room.channel_type === NEGOTIATION_ROOM_TYPE.OPS_OWNER) ?? null;
  const combinedRoom =
    rooms.find((room) => room.channel_type === NEGOTIATION_ROOM_TYPE.COMBINED) ?? null;
  const orderedRoomTypes = [
    NEGOTIATION_ROOM_TYPE.OPS_TENANT,
    NEGOTIATION_ROOM_TYPE.OPS_OWNER,
    NEGOTIATION_ROOM_TYPE.COMBINED,
  ] as const;
  const defaultTab = orderedRoomTypes.find((roomType) =>
    rooms.some((room) => room.channel_type === roomType),
  );

  return (
    <Tabs defaultValue={defaultTab} className="space-y-3">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value={NEGOTIATION_ROOM_TYPE.OPS_TENANT}>OPS ↔ Tenant</TabsTrigger>
        <TabsTrigger value={NEGOTIATION_ROOM_TYPE.OPS_OWNER}>OPS ↔ Owner</TabsTrigger>
        <TabsTrigger value={NEGOTIATION_ROOM_TYPE.COMBINED}>Combined</TabsTrigger>
      </TabsList>

      <TabsContent value={NEGOTIATION_ROOM_TYPE.OPS_TENANT} className="mt-0">
        {opsTenantRoom ? (
          <ChatView
            channelId={opsTenantRoom._id}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            canArchive={false}
            showOriginal
            className="h-[540px]"
          />
        ) : (
          <EmptyRoom label="OPS ↔ Tenant" />
        )}
      </TabsContent>

      <TabsContent value={NEGOTIATION_ROOM_TYPE.OPS_OWNER} className="mt-0">
        {opsOwnerRoom ? (
          <ChatView
            channelId={opsOwnerRoom._id}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            canArchive={false}
            showOriginal
            className="h-[540px]"
          />
        ) : (
          <EmptyRoom label="OPS ↔ Owner" />
        )}
      </TabsContent>

      <TabsContent value={NEGOTIATION_ROOM_TYPE.COMBINED} className="mt-0">
        {combinedRoom ? (
          <ChatView
            channelId={combinedRoom._id}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            canArchive={false}
            showOriginal
            className="h-[540px]"
          />
        ) : (
          <EmptyRoom label="Combined" />
        )}
      </TabsContent>
    </Tabs>
  );
}
