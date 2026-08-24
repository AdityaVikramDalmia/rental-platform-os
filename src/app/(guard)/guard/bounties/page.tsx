"use client";

import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { ClipboardList, Gift, Inbox, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcceptedCard } from "./components/accepted-card";
import { BountyCard } from "./components/bounty-card";

type BountyTab = "available" | "accepted";

function isAlreadyClaimedError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("already") &&
      (normalized.includes("accepted") || normalized.includes("claimed"))) ||
    normalized.includes("cannot accept bounty for inquiry with status")
  );
}

export default function GuardBountiesPage() {
  const [activeTab, setActiveTab] = useState<BountyTab>("available");
  const [acceptingId, setAcceptingId] = useState<Id<"tenant_inquiries"> | null>(null);

  const availableBountiesResult = useQuery(api.tenantInquiries.listBounties, {
    tab: "available",
    paginationOpts: { numItems: 100, cursor: null },
  });
  const acceptedBountiesResult = useQuery(api.tenantInquiries.listByGuard, {
    paginationOpts: { numItems: 100, cursor: null },
  });
  const acceptBounty = useMutation(api.tenantInquiries.acceptBounty);

  const availableBounties = availableBountiesResult?.page;
  const acceptedBounties = acceptedBountiesResult?.page;

  const availableCount = availableBounties?.length ?? 0;
  const activeTabBounties = activeTab === "available" ? availableBounties : acceptedBounties;
  const isLoadingActiveTab = activeTabBounties === undefined;

  const handleTabChange = (value: string) => {
    if (value === "available" || value === "accepted") {
      setActiveTab(value);
    }
  };

  const handleAccept = async (id: Id<"tenant_inquiries">) => {
    try {
      setAcceptingId(id);
      await acceptBounty({ id });
      toast.success("Bounty accepted! You'll be notified when the visit is scheduled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to accept bounty";
      if (isAlreadyClaimedError(message)) {
        toast.error("This bounty was already claimed by another guard.");
      } else {
        toast.error(message);
      }
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gift className="size-5 text-slate-700" />
        <h1 className="text-xl font-bold text-slate-900">Bounty Board</h1>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="available" className="flex-1">
            Available
            {availableCount > 0 && (
              <Badge className="ml-2 bg-amber-100 text-amber-700">{availableCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="accepted" className="flex-1">
            My Accepted
          </TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="mt-4">
          {isLoadingActiveTab && activeTab === "available" && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-7 animate-spin text-slate-400" />
            </div>
          )}

          {!isLoadingActiveTab && availableBounties && availableBounties.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-slate-100 p-4">
                <Inbox className="size-8 text-slate-400" />
              </div>
              <p className="text-base font-medium text-slate-600">
                No bounties available in your society right now
              </p>
            </div>
          )}

          {!isLoadingActiveTab && availableBounties && availableBounties.length > 0 && (
            <div className="space-y-3">
              {availableBounties.map((bounty) => (
                <BountyCard
                  key={String(bounty._id)}
                  bounty={bounty}
                  isAccepting={acceptingId === bounty._id}
                  onAccept={handleAccept}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="accepted" className="mt-4">
          {isLoadingActiveTab && activeTab === "accepted" && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-7 animate-spin text-slate-400" />
            </div>
          )}

          {!isLoadingActiveTab && acceptedBounties && acceptedBounties.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-slate-100 p-4">
                <ClipboardList className="size-8 text-slate-400" />
              </div>
              <p className="text-base font-medium text-slate-600">
                You haven&apos;t accepted any bounties yet
              </p>
            </div>
          )}

          {!isLoadingActiveTab && acceptedBounties && acceptedBounties.length > 0 && (
            <div className="space-y-3">
              {acceptedBounties.map((bounty) => (
                <AcceptedCard key={String(bounty._id)} bounty={bounty} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
