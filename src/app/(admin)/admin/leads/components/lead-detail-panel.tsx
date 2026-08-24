"use client";

import { useQuery } from "convex/react";
import {
  AlertTriangle,
  BadgeIndianRupee,
  Calendar,
  Clock,
  Home,
  Info,
  Phone,
  PhoneCall,
  User,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  AVAILABILITY_TYPE,
  FURNISHING,
  LEAD_STATUS,
  PERMISSIONS,
  QUALITY_FLAGS,
} from "../../../../../../lib/constants";
import { formatDate, formatDateTime, formatRelativeTime } from "../../../../../../lib/dates";
import { formatINR } from "../../../../../../lib/money";
import { formatPhoneDisplay } from "../../../../../../lib/validators";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { NotesThread } from "@/components/shared/notes-thread";
import { QualityFlagBadge } from "@/components/shared/quality-flag-badge";
import { StatusTimeline } from "@/components/shared/status-timeline";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadGuardCard } from "./lead-guard-card";
import { LeadDuplicateInfo } from "./lead-duplicate-info";
import { RequestInfoDialog } from "./request-info-dialog";
import { RejectDialog } from "./reject-dialog";
import { MarkDuplicateDialog } from "./mark-duplicate-dialog";
import { SetBountyDialog } from "./set-bounty-dialog";
import { VerificationPanel } from "./verification-panel";
import { VerificationAttempts } from "./verification-attempts";

const FURNISHING_LABELS: Record<string, string> = {
  [FURNISHING.UNFURNISHED]: "Unfurnished",
  [FURNISHING.SEMI_FURNISHED]: "Semi-Furnished",
  [FURNISHING.FULLY_FURNISHED]: "Fully Furnished",
};

const AVAILABILITY_LABELS: Record<string, string> = {
  [AVAILABILITY_TYPE.VACANT_NOW]: "Vacant Now",
  [AVAILABILITY_TYPE.VACANT_FROM]: "Vacant From",
};

type LeadDetailPanelProps = {
  leadId: Id<"leads"> | null;
  permissionSet: Set<string>;
  onClose: () => void;
  shortcutAction?: "verify" | "reject" | null;
  onShortcutActionHandled?: () => void;
};

export function LeadDetailPanel({
  leadId,
  permissionSet,
  onClose,
  shortcutAction,
  onShortcutActionHandled,
}: LeadDetailPanelProps) {
  const lead = useQuery(api.leads.getById, leadId ? { lead_id: leadId } : "skip");

  const verificationAttempts = useQuery(
    api.verifications.listByLead,
    leadId ? { lead_id: leadId } : "skip",
  );

  const [requestInfoOpen, setRequestInfoOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [markDuplicateOpen, setMarkDuplicateOpen] = useState(false);
  const [clearDuplicateOpen, setClearDuplicateOpen] = useState(false);
  const [setBountyOpen, setSetBountyOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const canRequestInfo = permissionSet.has(PERMISSIONS.LEADS_REQUEST_INFO);
  const canReject = permissionSet.has(PERMISSIONS.LEADS_REJECT);
  const canMarkDuplicate = permissionSet.has(PERMISSIONS.LEADS_MARK_DUPLICATE);
  const canSetBounty = permissionSet.has(PERMISSIONS.LEADS_SET_BOUNTY);
  const canVerify = permissionSet.has(PERMISSIONS.LEADS_VERIFY);

  const isOpen = leadId !== null;
  const isLoading = isOpen && lead === undefined;

  const hasDuplicateFlags =
    lead &&
    (lead.status === LEAD_STATUS.POTENTIAL_DUPLICATE ||
      (lead.quality_flags ?? []).some(
        (flag) =>
          flag === QUALITY_FLAGS.DUPLICATE_FLAT_MATCH ||
          flag === QUALITY_FLAGS.DUPLICATE_PHONE_MATCH,
      ));

  const isTerminal =
    lead && (lead.status === LEAD_STATUS.REJECTED || lead.status === LEAD_STATUS.DUPLICATE);

  useEffect(() => {
    if (!shortcutAction || !lead) {
      return;
    }

    const canShortcutReject =
      canReject &&
      (lead.status === LEAD_STATUS.SUBMITTED ||
        lead.status === LEAD_STATUS.NEED_INFO ||
        lead.status === LEAD_STATUS.VERIFIED);

    if (shortcutAction === "verify" && canVerify && lead.status === LEAD_STATUS.SUBMITTED) {
      // This effect consumes a one-shot external command (the `shortcutAction`
      // prop) once the lead has loaded, then notifies the parent via
      // `onShortcutActionHandled`; that callback is a side effect that cannot
      // run safely during render, so this must stay in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerifyOpen(true);
      onShortcutActionHandled?.();
      return;
    }

    if (shortcutAction === "reject" && canShortcutReject) {
      setRejectOpen(true);
      onShortcutActionHandled?.();
      return;
    }

    onShortcutActionHandled?.();
  }, [canReject, canVerify, lead, onShortcutActionHandled, shortcutAction]);

  const renderSocietyLink = (societyId: string | undefined | null, name: string) => {
    if (!societyId) {
      return <span>{name}</span>;
    }

    return (
      <Link href={`/admin/societies/${societyId}`} className="text-blue-600 hover:underline">
        {name}
      </Link>
    );
  };

  // Build timeline entries from notes_thread timestamps + creation
  const timelineEntries = lead
    ? [
        {
          status: LEAD_STATUS.SUBMITTED,
          label: "Submitted",
          timestamp: lead._creationTime,
          isCurrent: lead.status === LEAD_STATUS.SUBMITTED,
        },
        ...(lead.notes_thread ?? []).map((note) => {
          const inferredStatus =
            note.author_type === "ADMIN" && note.note.startsWith("Rejected:")
              ? LEAD_STATUS.REJECTED
              : note.author_type === "ADMIN" && note.note.startsWith("Marked duplicate:")
                ? LEAD_STATUS.DUPLICATE
                : note.author_type === "ADMIN"
                  ? LEAD_STATUS.NEED_INFO
                  : LEAD_STATUS.SUBMITTED;
          return {
            status: inferredStatus,
            label: `${note.author_type === "ADMIN" ? "Admin" : note.author_type === "OPS" ? "Ops" : "Guard"}: ${note.note.slice(0, 50)}${note.note.length > 50 ? "..." : ""}`,
            timestamp: note.timestamp,
            isCurrent: false,
          };
        }),
      ]
    : [];

  // Mark last entry as current
  if (timelineEntries.length > 0) {
    timelineEntries[timelineEntries.length - 1].isCurrent = true;
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-none sm:w-[40vw] min-w-[400px]"
        >
          <SheetHeader>
            {isLoading ? (
              <>
                <SheetTitle className="sr-only">Loading lead details</SheetTitle>
                <SheetDescription className="sr-only">Please wait</SheetDescription>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : lead ? (
              <>
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-lg">
                    {lead.building?.name ?? "—"} / {lead.flat_number}
                  </SheetTitle>
                  <LeadStatusBadge status={lead.status} size="md" />
                </div>
                <SheetDescription>
                  Fl {lead.floor_number} &middot;{" "}
                  {renderSocietyLink(lead.society?.society_id, lead.society?.name ?? "—")} &middot;{" "}
                  {formatRelativeTime(lead._creationTime)}
                </SheetDescription>
              </>
            ) : (
              <>
                <SheetTitle>Lead Details</SheetTitle>
                <SheetDescription>Select a lead to view details.</SheetDescription>
              </>
            )}
          </SheetHeader>

          {isLoading && (
            <div className="space-y-4 px-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`panel-skeleton-${i}`} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          )}

          {lead && (
            <div className="space-y-5 px-4 pb-6">
              {/* Lead Info */}
              <section>
                <SectionTitle icon={<Home className="size-3.5" />} title="Lead Info" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <InfoRow
                    label="Building"
                    value={renderSocietyLink(lead.society?.society_id, lead.building?.name ?? "—")}
                  />
                  <InfoRow
                    label="Society"
                    value={renderSocietyLink(lead.society?.society_id, lead.society?.name ?? "—")}
                  />
                  <InfoRow label="Floors" value={lead.building?.total_floors?.toString() ?? "—"} />
                  <InfoRow label="Floor" value={lead.floor_number} />
                  <InfoRow label="Flat" value={lead.flat_number} />
                  <InfoRow label="Submitted" value={formatDateTime(lead._creationTime)} />
                  <InfoRow label="Lead ID" value={lead._id.slice(0, 10) + "..."} />
                </div>
              </section>

              {/* Owner Section */}
              <section>
                <SectionTitle icon={<User className="size-3.5" />} title="Owner" />
                <div className="space-y-1.5 text-sm">
                  {lead.owner_name && <InfoRow label="Name" value={lead.owner_name} />}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Phone</span>
                    <a
                      href={`tel:+91${lead.owner_phone}`}
                      className="flex items-center gap-1 font-medium text-slate-900 hover:underline"
                    >
                      <Phone className="size-3 text-slate-400" />
                      {formatPhoneDisplay(lead.owner_phone)}
                    </a>
                  </div>
                </div>
              </section>

              {/* Vacancy Details */}
              <section>
                <SectionTitle icon={<Calendar className="size-3.5" />} title="Vacancy Details" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <InfoRow
                    label="Availability"
                    value={AVAILABILITY_LABELS[lead.availability_type] ?? lead.availability_type}
                  />
                  {lead.availability_date && (
                    <InfoRow label="From" value={formatDate(lead.availability_date)} />
                  )}
                  {lead.rent_expected !== undefined && (
                    <InfoRow label="Rent" value={formatINR(lead.rent_expected)} />
                  )}
                  {lead.furnishing && (
                    <InfoRow
                      label="Furnishing"
                      value={FURNISHING_LABELS[lead.furnishing] ?? lead.furnishing}
                    />
                  )}
                </div>
                {lead.notes && (
                  <p className="mt-2 text-sm text-slate-600 italic">&ldquo;{lead.notes}&rdquo;</p>
                )}
              </section>

              {/* Guard Profile Card */}
              {lead.guard && (
                <section>
                  <SectionTitle icon={<Info className="size-3.5" />} title="Guard" />
                  <LeadGuardCard guard={lead.guard} societyName={lead.society?.name} />
                </section>
              )}

              {/* Duplicate Info */}
              {hasDuplicateFlags && (
                <LeadDuplicateInfo
                  qualityFlags={lead.quality_flags ?? []}
                  duplicateLead={lead.duplicate_lead}
                  onMarkDuplicate={() => setMarkDuplicateOpen(true)}
                  onClearFlag={() => setClearDuplicateOpen(true)}
                  canMarkDuplicate={
                    canMarkDuplicate && lead.status === LEAD_STATUS.POTENTIAL_DUPLICATE
                  }
                />
              )}

              {(lead.quality_flags?.length ?? 0) > 0 && (
                <section>
                  <SectionTitle
                    icon={<AlertTriangle className="size-3.5" />}
                    title="Quality Flags"
                  />
                  <QualityFlagBadge flags={lead.quality_flags ?? []} />
                </section>
              )}

              {/* Verification Attempts */}
              {verificationAttempts !== undefined && (
                <section>
                  <SectionTitle
                    icon={<PhoneCall className="size-3.5" />}
                    title="Verification Attempts"
                  />
                  <VerificationAttempts attempts={verificationAttempts} />
                </section>
              )}

              {/* Notes Thread */}
              <section>
                <SectionTitle icon={<Info className="size-3.5" />} title="Notes" />
                <NotesThread notes={lead.notes_thread ?? []} />
              </section>

              {/* Status Timeline */}
              <section>
                <SectionTitle icon={<Clock className="size-3.5" />} title="Timeline" />
                <StatusTimeline entries={timelineEntries} />
              </section>

              {/* Bounty */}
              {lead.prospective_bounty !== undefined && (
                <section>
                  <SectionTitle
                    icon={<BadgeIndianRupee className="size-3.5" />}
                    title="Prospective Bounty"
                  />
                  <p className="text-lg font-bold text-emerald-700">
                    {formatINR(lead.prospective_bounty)}
                  </p>
                </section>
              )}

              {/* Action Buttons */}
              {!isTerminal && (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  {lead.status === LEAD_STATUS.SUBMITTED && canVerify && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVerifyOpen(true)}
                      className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
                    >
                      <PhoneCall className="mr-1.5 size-3.5" />
                      Call &amp; Verify
                    </Button>
                  )}
                  {lead.status === LEAD_STATUS.SUBMITTED && canRequestInfo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRequestInfoOpen(true)}
                      className="border-amber-300 text-amber-800 hover:bg-amber-50"
                    >
                      Request Info
                    </Button>
                  )}
                  {(lead.status === LEAD_STATUS.SUBMITTED ||
                    lead.status === LEAD_STATUS.NEED_INFO) &&
                    canReject && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setRejectOpen(true)}
                      >
                        Reject
                      </Button>
                    )}
                  {lead.status === LEAD_STATUS.VERIFIED && canReject && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setRejectOpen(true)}
                    >
                      Reject
                    </Button>
                  )}
                  {canSetBounty && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSetBountyOpen(true)}
                      className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                    >
                      Set Bounty
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialogs — rendered outside Sheet to avoid z-index issues */}
      {lead && (
        <>
          <RequestInfoDialog
            open={requestInfoOpen}
            onOpenChange={setRequestInfoOpen}
            leadId={lead._id}
          />
          <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} leadId={lead._id} />
          <MarkDuplicateDialog
            open={markDuplicateOpen}
            onOpenChange={setMarkDuplicateOpen}
            leadId={lead._id}
            originalLeadId={lead.duplicate_of_lead_id ?? undefined}
            duplicateLead={lead.duplicate_lead}
            mode="mark"
          />
          <MarkDuplicateDialog
            open={clearDuplicateOpen}
            onOpenChange={setClearDuplicateOpen}
            leadId={lead._id}
            mode="clear"
          />
          <SetBountyDialog
            open={setBountyOpen}
            onOpenChange={setSetBountyOpen}
            leadId={lead._id}
            existingBounty={lead.prospective_bounty}
          />
          <VerificationPanel
            open={verifyOpen}
            onOpenChange={setVerifyOpen}
            leadId={lead._id}
            ownerName={lead.owner_name}
            ownerPhone={lead.owner_phone}
          />
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
