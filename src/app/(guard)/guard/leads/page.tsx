"use client";

import { usePaginatedQuery } from "convex/react";
import { FileText, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { LeadCard } from "./components/lead-card";
import { LeadFilterTabs } from "./components/lead-filter-tabs";

type StatusFilter = "ALL" | "IN_REVIEW" | "VERIFIED" | "REJECTED";

export default function MyLeadsPage() {
  const t = useTranslations("guard.leads");
  const [activeTab, setActiveTab] = useState<StatusFilter>("ALL");

  const { results, status, loadMore } = usePaginatedQuery(
    api.leads.getMyLeads,
    { status_filter: activeTab === "ALL" ? undefined : activeTab },
    { initialNumItems: 20 },
  );

  const isLoadingFirst = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-slate-700" />
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        </div>
        <Button asChild size="sm" className="h-9 rounded-lg bg-slate-900 text-sm font-semibold">
          <Link href="/guard/submit-lead">
            <Plus className="mr-1 size-4" />
            {t("add")}
          </Link>
        </Button>
      </div>

      <LeadFilterTabs
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as StatusFilter)}
      />

      {isLoadingFirst && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoadingFirst && results.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="rounded-full bg-slate-100 p-4">
            <FileText className="size-8 text-slate-400" />
          </div>
          {activeTab === "ALL" ? (
            <>
              <p className="text-base font-medium text-slate-600">{t("emptyState")}</p>
              <p className="text-sm text-slate-400">{t("emptyStateAction")}</p>
              <Button
                asChild
                className="mt-2 h-11 rounded-xl bg-slate-900 px-6 text-base font-semibold"
              >
                <Link href="/guard/submit-lead">
                  <Plus className="mr-1 size-4" />
                  {t("emptyStateButton")}
                </Link>
              </Button>
            </>
          ) : (
            <p className="text-base font-medium text-slate-500">{t("noFilteredLeads")}</p>
          )}
        </div>
      )}

      {!isLoadingFirst && results.length > 0 && (
        <div className="space-y-3">
          {results.map((lead) => (
            <LeadCard
              key={String(lead._id)}
              id={String(lead._id)}
              buildingName={lead.building_name}
              floorNumber={lead.floor_number}
              flatNumber={lead.flat_number}
              ownerPhone={lead.owner_phone}
              status={lead.status}
              createdAt={lead._creationTime}
              qualityFlags={lead.quality_flags}
              notesThread={lead.notes_thread}
            />
          ))}

          {canLoadMore && (
            <Button
              variant="outline"
              onClick={() => loadMore(20)}
              className="h-11 w-full rounded-xl border-slate-200 text-base font-semibold text-slate-600"
            >
              {t("loadMore")}
            </Button>
          )}

          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
