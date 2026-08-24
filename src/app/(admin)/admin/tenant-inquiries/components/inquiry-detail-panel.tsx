"use client";

import { useMutation, useQuery } from "convex/react";
import {
  BadgeIndianRupee,
  Calendar,
  ClipboardList,
  Clock,
  Home,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  PERMISSIONS,
  TENANT_INQUIRY_STATUS,
  TENANT_INQUIRY_STATUS_COLORS,
  TENANT_INQUIRY_STATUS_LABELS,
} from "../../../../../../lib/constants";
import { formatDate, formatDateTime, formatRelativeTime } from "../../../../../../lib/dates";
import { formatINR } from "../../../../../../lib/money";
import { formatPhoneDisplay } from "../../../../../../lib/validators";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChatView } from "@/components/chat/ChatView";
import { DealChecklistSection } from "./deal-checklist-section";
import { PostBountyDialog } from "./post-bounty-dialog";
import { RejectDialog } from "./reject-dialog";
import { ReviewDialog } from "./review-dialog";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";
import { OwnerInviteSection } from "./owner-invite-section";
import { StartTransactionDialog } from "./start-transaction-dialog";

type InquiryDetailPanelProps = {
  inquiryId: Id<"tenant_inquiries"> | null;
  onClose: () => void;
  canReview?: boolean;
};

export function InquiryDetailPanel({
  inquiryId,
  onClose,
  canReview = false,
}: InquiryDetailPanelProps) {
  const router = useRouter();
  const inquiry = useQuery(api.tenantInquiries.getById, inquiryId ? { id: inquiryId } : "skip");
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );
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
  const hasPermission = useCallback(
    (permission: string) => permissionSet.has(permission),
    [permissionSet],
  );
  const isBackofficeUser =
    currentUser?.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
    (currentUser?.user_type === "ADMIN" || currentUser?.user_type === "OPS");
  const hasChatViewPermission = isBackofficeUser && hasPermission(PERMISSIONS.CHAT_VIEW);
  const canCreateChatChannel = isBackofficeUser && hasPermission(PERMISSIONS.CHAT_ADMIN);
  const canViewChecklists = isBackofficeUser && hasPermission(PERMISSIONS.DEAL_CHECKLISTS_VIEW);
  const canManageChecklists = isBackofficeUser && hasPermission(PERMISSIONS.DEAL_CHECKLISTS_MANAGE);
  const canManageInvites = isBackofficeUser && hasPermission(PERMISSIONS.OWNER_INVITES_MANAGE);
  const canViewTransactions = isBackofficeUser && hasPermission(PERMISSIONS.TRANSACTIONS_VIEW);
  const canManageTransactions = isBackofficeUser && hasPermission(PERMISSIONS.TRANSACTIONS_MANAGE);
  const canRunInquiryActions =
    canReview && isBackofficeUser && hasPermission(PERMISSIONS.TENANT_INQUIRIES_MANAGE);

  const chatChannel = useQuery(
    api.chatChannels.getByInquiryId,
    inquiryId && hasChatViewPermission ? { inquiry_id: inquiryId } : "skip",
  );
  const checklistForChannel = useQuery(
    api.dealChecklists.getByInquiry,
    inquiryId && canViewChecklists ? { inquiry_id: inquiryId } : "skip",
  );
  const inviteForChannel = useQuery(
    api.ownerInvites.getForInquiry,
    inquiryId && canManageInvites ? { inquiry_id: inquiryId } : "skip",
  );
  const linkedTransaction = useQuery(
    api.rentalTransactions.getById,
    inquiry?.transaction_id && canViewTransactions ? { id: inquiry.transaction_id } : "skip",
  );

  const dealRoomChannelId =
    chatChannel?._id ?? checklistForChannel?.channel_id ?? inviteForChannel?.channel_id;

  const createChannel = useMutation(api.chatChannels.create);
  const expireInquiry = useMutation(api.tenantInquiries.expire);
  const closeInquiry = useMutation(api.tenantInquiries.close);
  const initiateNegotiation = useMutation(api.negotiations.initiate);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [postBountyOpen, setPostBountyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [scheduleVisitOpen, setScheduleVisitOpen] = useState(false);
  const [startTransactionOpen, setStartTransactionOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);

  const isOpen = inquiryId !== null;
  const isLoading = isOpen && inquiry === undefined;

  async function runAction(key: string, action: () => Promise<unknown>, successMessage: string) {
    setPendingAction(key);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setPendingAction(null);
    }
  }

  const bountyInfoStatuses = new Set<string>([
    TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
    TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
    TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
    TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
    TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    TENANT_INQUIRY_STATUS.CLOSED,
    TENANT_INQUIRY_STATUS.EXPIRED,
  ]);

  const visitInfoStatuses = new Set<string>([
    TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
    TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
    TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    TENANT_INQUIRY_STATUS.CLOSED,
  ]);

  const terminalStatuses = new Set<string>([
    TENANT_INQUIRY_STATUS.CLOSED,
    TENANT_INQUIRY_STATUS.REJECTED,
    TENANT_INQUIRY_STATUS.EXPIRED,
  ]);

  const showBountyInfo = inquiry ? bountyInfoStatuses.has(inquiry.status) : false;
  const showVisitInfo = inquiry ? visitInfoStatuses.has(inquiry.status) : false;
  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="min-w-[400px] w-full overflow-y-auto sm:max-w-none sm:w-[40vw]"
        >
          <SheetHeader>
            {isLoading ? (
              <>
                <SheetTitle className="sr-only">Loading inquiry details</SheetTitle>
                <SheetDescription className="sr-only">Please wait</SheetDescription>
                <Skeleton className="h-6 w-52" />
                <Skeleton className="h-4 w-36" />
              </>
            ) : inquiry ? (
              <>
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-lg">Inquiry #{inquiry._id.slice(-6)}</SheetTitle>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                      TENANT_INQUIRY_STATUS_COLORS[inquiry.status],
                    )}
                  >
                    {TENANT_INQUIRY_STATUS_LABELS[inquiry.status]}
                  </span>
                </div>
                <SheetDescription>{formatRelativeTime(inquiry._creationTime)}</SheetDescription>
              </>
            ) : (
              <>
                <SheetTitle>Tenant Inquiry</SheetTitle>
                <SheetDescription>Select an inquiry to view details.</SheetDescription>
              </>
            )}
          </SheetHeader>

          {isLoading && (
            <div className="space-y-4 px-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {inquiry && (
            <div className="space-y-5 px-4 pb-6">
              <section>
                <SectionTitle icon={<Clock className="size-3.5" />} title="Header" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <InfoRow label="Created" value={formatDateTime(inquiry._creationTime)} />
                  <InfoRow label="Status" value={TENANT_INQUIRY_STATUS_LABELS[inquiry.status]} />
                </div>
              </section>

              <section>
                <SectionTitle icon={<Home className="size-3.5" />} title="Listing Info" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <InfoRow label="Building" value={inquiry.building?.name ?? "—"} />
                  <InfoRow label="Floor" value={inquiry.listing?.floor_number ?? "—"} />
                  <InfoRow label="Flat" value={inquiry.lead?.flat_number ?? "—"} />
                  <InfoRow label="BHK" value={inquiry.listing?.bhk_config ?? "—"} />
                  <InfoRow
                    label="Rent"
                    value={
                      inquiry.listing?.rent_monthly !== undefined
                        ? formatINR(inquiry.listing.rent_monthly)
                        : "—"
                    }
                  />
                  <InfoRow
                    label="Listing"
                    value={
                      inquiry.listing?.slug ? (
                        <Link
                          href={`/listing/${inquiry.listing.slug}`}
                          target="_blank"
                          className="text-blue-600 hover:underline"
                        >
                          /listing/{inquiry.listing.slug}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                </div>
              </section>

              <section>
                <SectionTitle icon={<User className="size-3.5" />} title="Tenant Info" />
                <div className="grid grid-cols-1 gap-y-1.5 text-sm">
                  <InfoRow label="Name" value={inquiry.tenant_name} />
                  <InfoRow
                    label="Phone"
                    value={
                      <a href={`tel:+91${inquiry.tenant_phone}`} className="hover:underline">
                        {formatPhoneDisplay(inquiry.tenant_phone)}
                      </a>
                    }
                  />
                  <InfoRow label="Email" value={inquiry.tenant_email ?? "—"} />
                </div>
              </section>

              <section>
                <SectionTitle icon={<Calendar className="size-3.5" />} title="Request Details" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <InfoRow
                    label="Preferred Date"
                    value={
                      inquiry.preferred_visit_date
                        ? formatDate(inquiry.preferred_visit_date)
                        : "ASAP"
                    }
                  />
                  <InfoRow label="Time Slot" value={inquiry.preferred_visit_slot ?? "Any"} />
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {inquiry.message ?? "No message provided."}
                </p>
              </section>

              {showBountyInfo && (
                <section>
                  <SectionTitle
                    icon={<BadgeIndianRupee className="size-3.5" />}
                    title="Bounty Info"
                  />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <InfoRow
                      label="Amount"
                      value={
                        inquiry.bounty_amount !== undefined ? formatINR(inquiry.bounty_amount) : "—"
                      }
                    />
                    <InfoRow
                      label="Posted"
                      value={
                        inquiry.bounty_posted_at ? formatDateTime(inquiry.bounty_posted_at) : "—"
                      }
                    />
                    <InfoRow
                      label="Expires"
                      value={
                        inquiry.bounty_expires_at ? formatDateTime(inquiry.bounty_expires_at) : "—"
                      }
                    />
                    <InfoRow label="Guard" value={inquiry.guard?.name ?? "Unassigned"} />
                  </div>
                </section>
              )}

              {showVisitInfo && (
                <section>
                  <SectionTitle icon={<Calendar className="size-3.5" />} title="Visit Info" />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <InfoRow
                      label="Scheduled"
                      value={
                        inquiry.visit
                          ? `${formatDateTime(inquiry.visit.scheduled_start)} - ${formatDateTime(inquiry.visit.scheduled_end)}`
                          : "—"
                      }
                    />
                    <InfoRow label="Visit Status" value={inquiry.visit?.status ?? "—"} />
                  </div>
                </section>
              )}

              {canRunInquiryActions && (
                <section>
                  <SectionTitle icon={<MessageSquare className="size-3.5" />} title="Actions" />
                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                    {inquiry.status === TENANT_INQUIRY_STATUS.SUBMITTED && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReviewOpen(true)}
                          disabled={pendingAction !== null}
                        >
                          Review
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setRejectOpen(true)}
                          disabled={pendingAction !== null}
                        >
                          Reject
                        </Button>
                      </>
                    )}

                    {inquiry.status === TENANT_INQUIRY_STATUS.REVIEWED && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPostBountyOpen(true)}
                          disabled={pendingAction !== null}
                          className="border-amber-300 text-amber-800 hover:bg-amber-50"
                        >
                          Post Bounty
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setRejectOpen(true)}
                          disabled={pendingAction !== null}
                        >
                          Reject
                        </Button>
                      </>
                    )}

                    {inquiry.status === TENANT_INQUIRY_STATUS.BOUNTY_POSTED && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          runAction(
                            "expire",
                            () => expireInquiry({ id: inquiry._id }),
                            "Bounty expired",
                          )
                        }
                        disabled={pendingAction !== null}
                      >
                        {pendingAction === "expire" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Expire
                      </Button>
                    )}

                    {inquiry.status === TENANT_INQUIRY_STATUS.GUARD_ACCEPTED && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setScheduleVisitOpen(true)}
                        disabled={pendingAction !== null}
                        className="border-cyan-300 text-cyan-800 hover:bg-cyan-50"
                      >
                        Schedule Visit
                      </Button>
                    )}

                    {inquiry.status === TENANT_INQUIRY_STATUS.VISIT_COMPLETED && (
                      <>
                        {canManageTransactions && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setStartTransactionOpen(true)}
                            disabled={pendingAction !== null || !!inquiry.transaction_id}
                            className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
                          >
                            {inquiry.transaction_id ? "Transaction Started" : "Start Transaction"}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            runAction(
                              "close",
                              () => closeInquiry({ id: inquiry._id }),
                              "Inquiry closed",
                            )
                          }
                          disabled={pendingAction !== null}
                          className="border-green-300 text-green-800 hover:bg-green-50"
                        >
                          {pendingAction === "close" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Close
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            runAction(
                              "initiate_negotiation",
                              async () => {
                                const negotiationId = await initiateNegotiation({
                                  tenant_inquiry_id: inquiry._id,
                                });
                                router.push(`/admin/negotiations/${negotiationId}`);
                              },
                              "Negotiation initiated",
                            )
                          }
                          disabled={pendingAction !== null}
                        >
                          {pendingAction === "initiate_negotiation" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Initiate Negotiation
                        </Button>
                      </>
                    )}

                    {inquiry.status === TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED && (
                      <>
                        {canManageTransactions && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setStartTransactionOpen(true)}
                            disabled={pendingAction !== null || !!inquiry.transaction_id}
                            className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
                          >
                            {inquiry.transaction_id ? "Transaction Started" : "Start Transaction"}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            runAction(
                              "close",
                              () => closeInquiry({ id: inquiry._id }),
                              "Inquiry closed",
                            )
                          }
                          disabled={pendingAction !== null}
                          className="border-green-300 text-green-800 hover:bg-green-50"
                        >
                          {pendingAction === "close" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Close
                        </Button>
                      </>
                    )}

                    {terminalStatuses.has(inquiry.status) && (
                      <p className="text-sm text-slate-500">
                        No actions available for terminal states.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {chatChannel === null && hasChatViewPermission && canCreateChatChannel && (
                <section>
                  <SectionTitle icon={<MessageCircle className="size-3.5" />} title="Chat" />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      if (isCreatingChannel) {
                        return;
                      }

                      setIsCreatingChannel(true);
                      try {
                        await createChannel({ inquiry_id: inquiry._id });
                        toast.success("Chat channel created");
                      } catch (error) {
                        const message =
                          error instanceof Error ? error.message : "Failed to create channel";
                        const lowerMessage = message.toLowerCase();

                        if (
                          lowerMessage.includes("permission") ||
                          lowerMessage.includes("access required")
                        ) {
                          toast.error("You don't have permission to create chat channels");
                        } else {
                          toast.error(message);
                        }
                      } finally {
                        setIsCreatingChannel(false);
                      }
                    }}
                    disabled={isCreatingChannel}
                  >
                    {isCreatingChannel ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="mr-2 size-4" />
                        Open Chat Channel
                      </>
                    )}
                  </Button>
                </section>
              )}

              {hasChatViewPermission && chatChannel && currentUser && (
                <section>
                  <SectionTitle icon={<MessageCircle className="size-3.5" />} title="Chat" />
                  <ChatView
                    channelId={chatChannel._id}
                    currentUserId={currentUser._id}
                    currentUserRole={
                      (currentUser.active_persona ?? currentUser.user_type) as string
                    }
                    canArchive={canCreateChatChannel}
                    showOriginal={
                      currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
                      (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS")
                    }
                    className="h-[400px]"
                  />
                </section>
              )}

              {canViewChecklists && (
                <section>
                  <SectionTitle
                    icon={<ClipboardList className="size-3.5" />}
                    title="Deal Checklist"
                  />
                  <DealChecklistSection
                    inquiryId={inquiry._id}
                    channelId={dealRoomChannelId}
                    canManage={canManageChecklists}
                  />
                </section>
              )}

              {canManageInvites && (
                <section>
                  <SectionTitle icon={<Mail className="size-3.5" />} title="Owner Invite" />
                  <OwnerInviteSection
                    inquiryId={inquiry._id}
                    channelId={dealRoomChannelId}
                    canManage={canManageInvites}
                  />
                </section>
              )}

              <section>
                <SectionTitle icon={<Phone className="size-3.5" />} title="Ops Notes" />
                <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {inquiry.ops_notes ?? "No ops notes added yet."}
                </p>
              </section>

              {inquiry.transaction_id && canViewTransactions && (
                <section>
                  <SectionTitle icon={<ClipboardList className="size-3.5" />} title="Transaction" />
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p>
                      Linked transaction:{" "}
                      <span className="font-semibold">{inquiry.transaction_id}</span>
                    </p>
                    <p className="mt-1">
                      Status: {linkedTransaction?.transaction?.status ?? "Loading..."}
                    </p>
                  </div>
                </section>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {inquiry && (
        <>
          <PostBountyDialog
            open={postBountyOpen}
            onOpenChange={setPostBountyOpen}
            inquiryId={inquiry._id}
          />
          <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} inquiryId={inquiry._id} />
          <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} inquiryId={inquiry._id} />
          <ScheduleVisitDialog
            open={scheduleVisitOpen}
            onOpenChange={setScheduleVisitOpen}
            inquiryId={inquiry._id}
            guardName={inquiry.guard?.name}
          />
          {canManageTransactions && (
            <StartTransactionDialog
              open={startTransactionOpen}
              onOpenChange={setStartTransactionOpen}
              inquiryId={inquiry._id}
              defaultMonthlyRentPaise={inquiry.listing?.rent_monthly}
              defaultDepositPaise={inquiry.listing?.deposit}
            />
          )}
        </>
      )}
    </>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <span className="text-slate-400">{icon}</span>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-slate-500">{label}</span>
      <span className="ml-2 font-medium text-slate-900">{value}</span>
    </div>
  );
}
