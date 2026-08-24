"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import {
  INCENTIVE_CARD_TYPE,
  type IncentiveCardType,
  type IncentiveLevel,
} from "../../../../../../lib/constants";
import { IncentiveCardBadge } from "@/components/shared/incentive-card-badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ManualAwardDialog } from "./manual-award-dialog";

type ActiveCardRow = Doc<"incentive_cards"> & {
  guard_name: string;
};

type ActiveCardsTabProps = {
  canAward: boolean;
  canExpire: boolean;
};

const CARD_TYPE_OPTIONS: { value: IncentiveCardType; label: string }[] = [
  { value: INCENTIVE_CARD_TYPE.LEAD_MILESTONE, label: "Lead Milestone" },
  { value: INCENTIVE_CARD_TYPE.VISIT_MILESTONE, label: "Visit Milestone" },
  { value: INCENTIVE_CARD_TYPE.QUALITY_STREAK, label: "Quality Streak" },
  { value: INCENTIVE_CARD_TYPE.SPEED_BONUS, label: "Speed Bonus" },
  { value: INCENTIVE_CARD_TYPE.MONTHLY_TOP, label: "Monthly Top" },
];

const expireReasonSchema = z.object({
  reason: z.string().trim().min(1, "Reason for expiry is required"),
});

type ExpireReasonValues = z.infer<typeof expireReasonSchema>;

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

function toLevelLabel(level: IncentiveLevel): string {
  return `${level.charAt(0)}${level.slice(1).toLowerCase()}`;
}

export function ActiveCardsTab({ canAward, canExpire }: ActiveCardsTabProps) {
  const expireCard = useMutation(api.incentives.expire);

  const guards = useQuery(api.guards.list, {});
  const [guardSearch, setGuardSearch] = useState("");
  const [guardUserIdFilter, setGuardUserIdFilter] = useState<string>("");
  const [cardTypeFilter, setCardTypeFilter] = useState<string>("");
  const [isAwardDialogOpen, setIsAwardDialogOpen] = useState(false);
  const [loadingCardId, setLoadingCardId] = useState<Id<"incentive_cards"> | null>(null);
  const [expiringCard, setExpiringCard] = useState<ActiveCardRow | null>(null);
  const expireForm = useForm<ExpireReasonValues>({
    resolver: zodResolver(expireReasonSchema),
    defaultValues: { reason: "" },
  });

  const queryArgs: {
    guard_user_id?: Id<"users">;
    card_type?: IncentiveCardType;
  } = {};

  if (guardUserIdFilter) {
    queryArgs.guard_user_id = guardUserIdFilter as Id<"users">;
  }

  if (cardTypeFilter) {
    queryArgs.card_type = cardTypeFilter as IncentiveCardType;
  }

  const { results, status, loadMore } = usePaginatedQuery(api.incentives.listActive, queryArgs, {
    initialNumItems: 20,
  });

  const rows = results as ActiveCardRow[];

  const filteredGuards = useMemo(() => {
    if (!guards) {
      return [];
    }

    const normalized = guardSearch.trim().toLowerCase();
    if (!normalized) {
      return guards;
    }

    return guards.filter((guard) => {
      const haystack = `${guard.name} ${guard.phone ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [guardSearch, guards]);

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  async function onExpireSubmit(values: ExpireReasonValues) {
    if (!expiringCard) {
      return;
    }

    setLoadingCardId(expiringCard._id);
    try {
      await expireCard({ card_id: expiringCard._id, reason: values.reason });
      toast.success("Card expired");
      setExpiringCard(null);
      expireForm.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to expire card");
    } finally {
      setLoadingCardId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Input
              value={guardSearch}
              onChange={(event) => setGuardSearch(event.target.value)}
              placeholder="Search guard"
              className="h-9 w-[180px]"
            />
            <select
              value={guardUserIdFilter}
              onChange={(event) => setGuardUserIdFilter(event.target.value)}
              className="h-9 w-[250px] rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">All Guards</option>
              {filteredGuards.map((guard) => (
                <option key={guard.user_id} value={guard.user_id}>
                  {guard.name} ({guard.phone ?? "--"})
                </option>
              ))}
            </select>
          </div>

          <select
            value={cardTypeFilter}
            onChange={(event) => setCardTypeFilter(event.target.value)}
            className="h-9 w-[220px] rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All Card Types</option>
            {CARD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {canAward ? (
          <Button
            type="button"
            onClick={() => setIsAwardDialogOpen(true)}
            className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Award Card
          </Button>
        ) : null}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Guard</th>
                  <th className="px-3 py-2.5 font-medium">Card Type</th>
                  <th className="px-3 py-2.5 font-medium">Tier</th>
                  <th className="px-3 py-2.5 font-medium">Award Source</th>
                  <th className="px-3 py-2.5 font-medium">Earned Date</th>
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <tr
                        key={`active-cards-skeleton-${index}`}
                        className="border-b border-slate-100"
                      >
                        {Array.from({ length: 6 }).map((__, colIdx) => (
                          <td
                            key={`active-cards-skeleton-${index}-${colIdx}`}
                            className="px-3 py-3"
                          >
                            <Skeleton className="h-4 w-24" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((row) => {
                      const isRowLoading = loadingCardId === row._id;

                      return (
                        <tr key={row._id} className="border-b border-slate-100 text-slate-800">
                          <td className="px-3 py-3 text-slate-700">{row.guard_name}</td>
                          <td className="px-3 py-3">
                            <IncentiveCardBadge
                              cardType={row.card_type}
                              level={row.level}
                              status={row.status}
                            />
                          </td>
                          <td className="px-3 py-3 text-slate-700">{toLevelLabel(row.level)}</td>
                          <td className="px-3 py-3 text-slate-700">{row.awarded_method}</td>
                          <td className="px-3 py-3 text-slate-700">
                            {formatDate(row.earned_at ?? row._creationTime)}
                          </td>
                          <td className="px-3 py-3">
                            {canExpire ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setExpiringCard(row)}
                                disabled={isRowLoading}
                                className="h-8 border-red-200 px-2.5 text-red-700 hover:bg-red-50 hover:text-red-700"
                              >
                                {isRowLoading ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  "Expire"
                                )}
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isLoading && rows.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No active cards</p>
              <p className="mt-1 text-sm text-slate-500">
                Confirm suggestions or manually award cards to populate this table.
              </p>
            </div>
          )}

          {(canLoadMore || isLoadingMore) && (
            <div className="flex justify-center pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMore(20)}
                disabled={isLoadingMore}
                className="border-slate-300 text-slate-700"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ManualAwardDialog open={isAwardDialogOpen} onOpenChange={setIsAwardDialogOpen} />

      <Dialog
        open={Boolean(expiringCard)}
        onOpenChange={(open) => {
          if (!open) {
            setExpiringCard(null);
            expireForm.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expire card</DialogTitle>
            <DialogDescription>
              Add a reason before expiring this card. This action is recorded in audit logs.
            </DialogDescription>
          </DialogHeader>

          <Form {...expireForm}>
            <form onSubmit={expireForm.handleSubmit(onExpireSubmit)} className="space-y-4">
              <FormField
                control={expireForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700">Reason for expiry</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Explain why this card is being expired"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setExpiringCard(null);
                    expireForm.reset();
                  }}
                  disabled={loadingCardId !== null}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!expiringCard || loadingCardId !== null}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {loadingCardId !== null ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Expiring...
                    </>
                  ) : (
                    "Expire Card"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
