"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "convex/react";
import { z } from "zod";
import {
  Award,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  IndianRupee,
  KeyRound,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  TrendingUp,
  UserCog,
} from "lucide-react";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import { toast } from "sonner";
import { GUARD_TYPE, PERMISSIONS, USER_STATUS } from "../../../../../../lib/constants";
import { formatPhoneDisplay, isValidConvexId } from "../../../../../../lib/validators";
import { formatINR } from "../../../../../../lib/money";
import { ManualAwardDialog } from "../../incentives/components/manual-award-dialog";
import { IncentiveCardBadge } from "@/components/shared/incentive-card-badge";
import { GuardEditDialog } from "@/components/admin/GuardEditDialog";
import { GuardResetPasswordDialog } from "@/components/admin/GuardResetPasswordDialog";
import { GuardStatusDialog } from "@/components/admin/GuardStatusDialog";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { GuardAuditTab } from "@/components/admin/guards/guard-audit-tab";
import { GuardEarningsTab } from "@/components/admin/guards/guard-earnings-tab";
import { GuardLeadsTab } from "@/components/admin/guards/guard-leads-tab";
import { GuardQualityTab } from "@/components/admin/guards/guard-quality-tab";
import { GuardVisitsTab } from "@/components/admin/guards/guard-visits-tab";
import { ShiftCalendar } from "@/components/admin/ShiftCalendar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const GUARD_TYPE_LABELS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "Building",
  [GUARD_TYPE.MAIN_GATE]: "Main Gate",
  [GUARD_TYPE.PARK]: "Park",
  [GUARD_TYPE.ROVING]: "Roving",
  SOCIETY_GUARD: "Society Guard",
};

const GUARD_TYPE_BADGE_CLASS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "border-blue-200 bg-blue-50 text-blue-700",
  [GUARD_TYPE.MAIN_GATE]: "border-violet-200 bg-violet-50 text-violet-700",
  [GUARD_TYPE.PARK]: "border-emerald-200 bg-emerald-50 text-emerald-700",
  [GUARD_TYPE.ROVING]: "border-orange-200 bg-orange-50 text-orange-700",
};

function statusBadgeClassName(status: string): string {
  if (status === USER_STATUS.ACTIVE) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === USER_STATUS.INACTIVE) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === USER_STATUS.BANNED) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function personaBadgeClassName(persona: "GUARD" | "OPS"): string {
  if (persona === "OPS") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function getMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getReviewLabel(value: unknown): string | null {
  const metadata = getMetadataRecord(value);
  const reviewState = metadata?.review_state;

  if (typeof reviewState !== "string") {
    return null;
  }

  return reviewState.replace(/_/g, " ");
}

const expireReasonSchema = z.object({
  reason: z.string().trim().min(1, "Reason for expiry is required"),
});

type ExpireReasonValues = z.infer<typeof expireReasonSchema>;

type GuardIncentiveCard = Doc<"incentive_cards"> & {
  guard_name: string;
};

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-64" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["one", "two", "three", "four"].map((skeletonKey) => (
          <Card key={`stat-skeleton-${skeletonKey}`} className="border-slate-200">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200">
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function GuardDetailPage() {
  const params = useParams<{ id: string }>();
  const isValidId = isValidConvexId(params.id);
  const userId = isValidId ? (params.id as Id<"users">) : null;
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );
  const guard = useQuery(api.guards.getById, userId ? { user_id: userId } : "skip");
  const expireCard = useMutation(api.incentives.expire);

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();

    if (!roleAssignments) {
      return permissions;
    }

    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }

    return permissions;
  }, [roleAssignments]);

  const hasIncentivesView = permissionSet.has(PERMISSIONS.INCENTIVES_VIEW);
  const hasIncentivesAward = permissionSet.has(PERMISSIONS.INCENTIVES_AWARD);
  const hasIncentivesExpire = permissionSet.has(PERMISSIONS.INCENTIVES_EXPIRE);

  const incentiveCards = useQuery(
    api.incentives.getByGuard,
    userId && hasIncentivesView ? { guard_user_id: userId } : "skip",
  ) as GuardIncentiveCard[] | undefined;

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [isAwardDialogOpen, setIsAwardDialogOpen] = useState(false);
  const [expiringCardId, setExpiringCardId] = useState<Id<"incentive_cards"> | null>(null);
  const [isExpiring, setIsExpiring] = useState(false);
  const expireForm = useForm<ExpireReasonValues>({
    resolver: zodResolver(expireReasonSchema),
    defaultValues: { reason: "" },
  });

  if (!isValidId) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[{ label: "Guards", href: "/admin/guards" }, { label: "Field worker not found" }]}
        />
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Field worker not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">The provided field-worker ID is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (guard === undefined) {
    return <LoadingSkeleton />;
  }

  if (guard === null) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[{ label: "Guards", href: "/admin/guards" }, { label: "Field worker not found" }]}
        />
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Field worker not found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const persona: "GUARD" | "OPS" = guard.persona === "OPS" ? "OPS" : "GUARD";
  const isOpsFieldWorker = persona === "OPS";
  const subjectLabel = isOpsFieldWorker ? "OPS field worker" : "guard";

  const verifiedRate =
    guard.lead_count > 0
      ? `${Math.round((guard.verified_lead_count / guard.lead_count) * 100)}%`
      : "\u2014";

  const sortedIncentiveCards =
    incentiveCards?.slice().sort((a, b) => {
      if (a.status === "active" && b.status !== "active") {
        return -1;
      }

      if (a.status !== "active" && b.status === "active") {
        return 1;
      }

      return b._creationTime - a._creationTime;
    }) ?? [];

  async function onExpireSubmit(values: ExpireReasonValues) {
    if (!expiringCardId) {
      return;
    }

    setIsExpiring(true);
    try {
      await expireCard({ card_id: expiringCardId, reason: values.reason });
      toast.success("Card expired");
      setExpiringCardId(null);
      expireForm.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to expire card");
    } finally {
      setIsExpiring(false);
    }
  }

  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Guards", href: "/admin/guards" }, { label: guard.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 text-lg">
            <AvatarFallback className="bg-slate-200 text-slate-700 text-lg font-semibold">
              {getInitials(guard.name)}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{guard.name}</h2>
              <Badge className={statusBadgeClassName(guard.status)}>{guard.status}</Badge>
              <Badge className={personaBadgeClassName(persona)}>{persona}</Badge>
              <Badge
                className={
                  GUARD_TYPE_BADGE_CLASS[guard.guard_type] ??
                  "border-slate-200 bg-slate-100 text-slate-600"
                }
              >
                {GUARD_TYPE_LABELS[guard.guard_type] ?? guard.guard_type}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              {guard.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" />
                  {formatPhoneDisplay(guard.phone)}
                </span>
              ) : null}

              {guard.society_name ? (
                <Link
                  href={`/admin/societies/${guard.society_id}`}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 hover:underline"
                >
                  <MapPin className="size-3.5" />
                  {guard.society_name}
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {isOpsFieldWorker ? (
          <p className="max-w-md text-sm text-slate-600">
            This OPS field-worker profile is view-only here. OPS provisioning controls stay on the
            guards list create dialogs.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => setIsEditOpen(true)}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => setIsResetPasswordOpen(true)}
            >
              <KeyRound className="size-3.5" />
              Reset Password
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => setIsStatusOpen(true)}
            >
              <UserCog className="size-3.5" />
              Change Status
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Leads</CardTitle>
            <ClipboardList className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">{guard.lead_count}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Verified Rate</CardTitle>
            <TrendingUp className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">{verifiedRate}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Visits</CardTitle>
            <Eye className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {guard.visit_count}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Earnings</CardTitle>
            <IndianRupee className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {guard.payout_total_paise > 0 ? formatINR(guard.payout_total_paise) : "\u2014"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="w-full justify-start bg-slate-100">
          <TabsTrigger value="profile">
            <ShieldCheck className="size-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="shifts">
            <Clock className="size-3.5" />
            Shifts
          </TabsTrigger>
          <TabsTrigger value="leads">
            <ClipboardList className="size-3.5" />
            Leads
          </TabsTrigger>
          <TabsTrigger value="visits">
            <Eye className="size-3.5" />
            Visits
          </TabsTrigger>
          <TabsTrigger value="earnings">
            <IndianRupee className="size-3.5" />
            Earnings
          </TabsTrigger>
          <TabsTrigger value="incentives">
            <Award className="size-3.5" />
            Incentives
          </TabsTrigger>
          <TabsTrigger value="quality">
            <TrendingUp className="size-3.5" />
            Quality
          </TabsTrigger>
          <TabsTrigger value="audit">
            <FileText className="size-3.5" />
            Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="pt-6">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Full Name</dt>
                  <dd className="text-sm text-slate-900">{guard.name}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Phone</dt>
                  <dd className="text-sm tabular-nums text-slate-900">
                    {guard.phone ? formatPhoneDisplay(guard.phone) : "\u2014"}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Society</dt>
                  <dd className="text-sm text-slate-900">
                    {guard.society_name ? (
                      <Link
                        href={`/admin/societies/${guard.society_id}`}
                        className="text-slate-900 hover:underline"
                      >
                        {guard.society_name}
                      </Link>
                    ) : (
                      "\u2014"
                    )}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Field Worker Type</dt>
                  <dd className="text-sm text-slate-900">
                    {GUARD_TYPE_LABELS[guard.guard_type] ?? guard.guard_type}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Persona</dt>
                  <dd className="text-sm text-slate-900">{persona}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Status</dt>
                  <dd>
                    <Badge className={statusBadgeClassName(guard.status)}>{guard.status}</Badge>
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Must Change Password</dt>
                  <dd className="text-sm text-slate-900">
                    {guard.must_change_password ? "Yes" : "No"}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Onboarding Completed</dt>
                  <dd className="text-sm text-slate-900">
                    {guard.has_seen_onboarding ? "Yes" : "No"}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Verified Leads</dt>
                  <dd className="text-sm tabular-nums text-slate-900">
                    {guard.verified_lead_count} / {guard.lead_count}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-sm font-medium text-slate-500">Completed Visits</dt>
                  <dd className="text-sm tabular-nums text-slate-900">
                    {guard.completed_visit_count} / {guard.visit_count}
                  </dd>
                </div>

                {isOpsFieldWorker ? (
                  <div className="space-y-1 sm:col-span-2">
                    <dt className="text-sm font-medium text-slate-500">OPS Note</dt>
                    <dd className="text-sm text-slate-700">
                      This {subjectLabel} can appear in field-worker analytics and leaderboards when
                      persona filters include OPS.
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shifts">
          {isOpsFieldWorker ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-6 text-sm text-slate-600">
                Shift scheduling is guard-specific and is not used for OPS field-worker profiles.
              </CardContent>
            </Card>
          ) : (
            <ShiftCalendar guardUserId={guard.user_id} guardSocietyId={guard.society_id} />
          )}
        </TabsContent>

        <TabsContent value="leads">
          <GuardLeadsTab
            guardId={guard.guard_profile_id}
            guardUserId={guard.user_id}
            workerLabel={subjectLabel}
          />
        </TabsContent>

        <TabsContent value="visits">
          <GuardVisitsTab
            guardId={guard.guard_profile_id}
            guardUserId={guard.user_id}
            workerLabel={subjectLabel}
          />
        </TabsContent>

        <TabsContent value="earnings">
          <GuardEarningsTab
            guardId={guard.guard_profile_id}
            guardUserId={guard.user_id}
            workerLabel={subjectLabel}
          />
        </TabsContent>

        <TabsContent value="incentives">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Manage this {subjectLabel}&apos;s incentive cards.
                </p>
                {hasIncentivesAward ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsAwardDialogOpen(true)}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                  >
                    Award Card
                  </Button>
                ) : null}
              </div>

              {!hasIncentivesView ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                  You do not have permission to view incentives.
                </div>
              ) : incentiveCards === undefined ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : sortedIncentiveCards.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                  No incentive cards for this {subjectLabel}
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedIncentiveCards.map((card) => {
                    const isActive = card.status === "active";
                    const reviewLabel = getReviewLabel(card.metadata);

                    return (
                      <div
                        key={card._id}
                        className={cn(
                          "rounded-lg border p-4",
                          isActive
                            ? "border-slate-200 bg-white"
                            : "border-slate-200 bg-slate-50 opacity-75",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <IncentiveCardBadge
                              cardType={card.card_type}
                              level={card.level}
                              status={card.status}
                            />
                            <p className="text-sm font-medium text-slate-900">{card.title}</p>
                            <p className="text-sm text-slate-600">{card.description}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>Awarded: {card.awarded_method}</span>
                              <span>
                                Earned: {formatDate(card.earned_at ?? card._creationTime)}
                              </span>
                              {reviewLabel ? (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                  Review: {reviewLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {isActive && hasIncentivesExpire ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setExpiringCardId(card._id)}
                              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
                            >
                              Expire
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quality">
          {isOpsFieldWorker ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-6 text-sm text-slate-600">
                Quality drilldown in this panel is currently guard-focused. Use analytics persona
                filters to review OPS quality segmentation.
              </CardContent>
            </Card>
          ) : (
            <GuardQualityTab guardUserId={guard.user_id} />
          )}
        </TabsContent>

        <TabsContent value="audit">
          <GuardAuditTab guardId={guard.guard_profile_id} />
        </TabsContent>
      </Tabs>

      <GuardEditDialog open={isEditOpen} onOpenChange={setIsEditOpen} guard={guard} />
      <GuardStatusDialog open={isStatusOpen} onOpenChange={setIsStatusOpen} guard={guard} />
      <GuardResetPasswordDialog
        open={isResetPasswordOpen}
        onOpenChange={setIsResetPasswordOpen}
        guard={guard}
      />
      <ManualAwardDialog
        open={isAwardDialogOpen}
        onOpenChange={setIsAwardDialogOpen}
        defaultGuardUserId={guard.user_id}
        lockGuardSelection
      />
      <Dialog
        open={expiringCardId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setExpiringCardId(null);
            expireForm.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expire card</DialogTitle>
            <DialogDescription>
              Provide a reason before expiring this active card.
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
                      <Textarea rows={3} placeholder="Enter reason" {...field} />
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
                    setExpiringCardId(null);
                    expireForm.reset();
                  }}
                  disabled={isExpiring}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isExpiring || expiringCardId === null}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {isExpiring ? (
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
