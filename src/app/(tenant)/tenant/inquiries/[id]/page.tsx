"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, CalendarClock, MessageSquare, UserRound } from "lucide-react";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { TENANT_INQUIRY_STATUS_LABELS, USER_TYPE } from "../../../../../../lib/constants";
import { formatDate, formatDateTime } from "../../../../../../lib/dates";
import { formatINR } from "../../../../../../lib/money";
import { isValidConvexId } from "../../../../../../lib/validators";
import { InquiryStatusBadge } from "@/components/shared/inquiry-status-badge";
import { InquiryTimeline } from "@/components/tenant/inquiries/inquiry-timeline";
import { TenantChatPanel } from "@/components/tenant/messages/tenant-chat-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantInquiryDetailPage() {
  const params = useParams();
  const inquiryIdParam = params.id;
  const inquiryId = typeof inquiryIdParam === "string" ? inquiryIdParam : "";
  const isValidInquiryId = isValidConvexId(inquiryId);

  const inquiry = useQuery(
    api.tenantInquiries.getMyInquiryById,
    isValidInquiryId ? { id: inquiryId as Id<"tenant_inquiries"> } : "skip",
  );
  const currentUser = useQuery(api.users.getCurrentUser);

  const channel = useQuery(
    api.chatChannels.getByInquiryForTenant,
    inquiry ? { inquiry_id: inquiry.inquiry_id } : "skip",
  );

  const messagesHref = useMemo(() => {
    if (!channel) return "/tenant/messages";
    return `/tenant/messages/${channel._id}`;
  }, [channel]);

  const timelineInquiry = useMemo(() => {
    if (!inquiry) {
      return null;
    }

    return {
      status: inquiry.status,
      _creationTime: inquiry.created_at,
      updated_at: inquiry.updated_at,
      visit: inquiry.visit
        ? {
            scheduled_start: inquiry.visit.scheduled_start,
          }
        : null,
    };
  }, [inquiry]);

  if (!isValidInquiryId) {
    return (
      <Card className="border-slate-200">
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-base font-semibold text-slate-900">Invalid inquiry link</p>
          <p className="text-sm text-slate-600">Please open the inquiry again from your list.</p>
          <Button asChild variant="outline">
            <Link href="/tenant/inquiries">Back to inquiries</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (inquiry === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!inquiry) {
    return (
      <Card className="border-slate-200">
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-base font-semibold text-slate-900">Inquiry not found</p>
          <p className="text-sm text-slate-600">
            This inquiry may have been removed or is no longer available for your account.
          </p>
          <Button asChild variant="outline">
            <Link href="/tenant/inquiries">Back to inquiries</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <Button asChild variant="ghost" className="-ml-3 w-fit text-slate-600 hover:text-slate-900">
        <Link href="/tenant/inquiries">
          <ArrowLeft className="size-4" />
          Back to inquiries
        </Link>
      </Button>

      <Card className="border-slate-200">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-slate-900">
                {inquiry.listing?.title ?? "Listing"}
                {inquiry.listing?.bhk_config ? ` - ${inquiry.listing.bhk_config}` : ""}
              </CardTitle>
              <p className="text-sm text-slate-600">{inquiry.society_name ?? "Society"}</p>
            </div>
            <InquiryStatusBadge
              status={inquiry.status}
              label={TENANT_INQUIRY_STATUS_LABELS[inquiry.status]}
              size="md"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-900">Rent:</span>{" "}
            {inquiry.listing?.rent_monthly ? formatINR(inquiry.listing.rent_monthly) : "-"}
          </p>
          <p>
            <span className="font-medium text-slate-900">Preferred visit:</span>{" "}
            {inquiry.preferred_visit_date ? formatDate(inquiry.preferred_visit_date) : "ASAP"}
            {inquiry.preferred_visit_slot ? ` - ${inquiry.preferred_visit_slot}` : ""}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant="outline" size="sm">
              <Link href={messagesHref}>
                <MessageSquare className="mr-1.5 size-4" />
                Open Messages
              </Link>
            </Button>
            {inquiry.listing?.slug ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/listing/${inquiry.listing.slug}`}>View Listing</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Inquiry Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineInquiry ? <InquiryTimeline inquiry={timelineInquiry} /> : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <MessageSquare className="size-4 text-cyan-600" /> Deal-Room Chat
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentUser === undefined ? (
            <Skeleton className="h-[420px] w-full" />
          ) : currentUser && currentUser.user_type === USER_TYPE.TENANT ? (
            <TenantChatPanel
              inquiryId={inquiry.inquiry_id}
              currentUserId={currentUser._id}
              currentUserRole="TENANT"
              className="h-[420px]"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <CalendarClock className="size-4 text-cyan-600" /> Visit Linkage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          {inquiry.visit ? (
            <>
              <p>
                <span className="font-medium text-slate-900">Visit status:</span>{" "}
                {inquiry.visit.status}
              </p>
              <p>
                <span className="font-medium text-slate-900">Scheduled:</span>{" "}
                {formatDateTime(inquiry.visit.scheduled_start)} -{" "}
                {formatDateTime(inquiry.visit.scheduled_end)}
              </p>
              {inquiry.visit.outcome ? (
                <p>
                  <span className="font-medium text-slate-900">Outcome:</span>{" "}
                  {inquiry.visit.outcome}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-slate-600">Visit not scheduled yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <UserRound className="size-4 text-cyan-600" /> Assigned Guard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          <p>{inquiry.guard?.first_name ?? "Guard not assigned yet"}</p>
        </CardContent>
      </Card>
    </div>
  );
}
