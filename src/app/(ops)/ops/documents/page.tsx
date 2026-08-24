"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { FileText, FolderOpen, Shield } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import {
  DOCUMENT_OVERALL_STATUS,
  REGULATORY_STATUS,
  type DocumentOverallStatus,
  type RegulatoryStatus,
} from "../../../../../lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DocumentRequirementsList } from "./components/document-requirements-list";
import { RegulatorySlaCard } from "./components/regulatory-sla-card";

type DocFilter = "ALL" | DocumentOverallStatus;
type RegFilter = "ALL" | "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "OVERDUE";
type ActiveTab = "documents" | "regulatory";

const DOC_FILTERS: DocFilter[] = [
  "ALL",
  DOCUMENT_OVERALL_STATUS.NOT_STARTED,
  DOCUMENT_OVERALL_STATUS.IN_PROGRESS,
  DOCUMENT_OVERALL_STATUS.COMPLETE,
  DOCUMENT_OVERALL_STATUS.BLOCKED,
];

const REG_FILTERS: RegFilter[] = [
  "ALL",
  REGULATORY_STATUS.NOT_STARTED,
  REGULATORY_STATUS.IN_PROGRESS,
  REGULATORY_STATUS.SUBMITTED,
  REGULATORY_STATUS.OVERDUE,
];

function docFilterLabel(value: DocFilter): string {
  if (value === "ALL") return "All";
  return value.replace(/_/g, " ");
}

function regFilterLabel(value: RegFilter): string {
  if (value === "ALL") return "All";
  return value.replace(/_/g, " ");
}

const SKELETON_KEYS = ["doc-skel-1", "doc-skel-2", "doc-skel-3"];

export default function OpsDocumentsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("documents");
  const [docFilter, setDocFilter] = useState<DocFilter>("ALL");
  const [regFilter, setRegFilter] = useState<RegFilter>("ALL");
  const [nowMs] = useState(() => Date.now());

  const requirements = useQuery(api.documents.listAssignedToMe);
  const regulatoryItems = useQuery(api.societyLiaison.listAssignedToMe);

  const filteredRequirements = useMemo(() => {
    if (!requirements) return [];
    if (docFilter === "ALL") return requirements;
    return requirements.filter((r) => r.overall_status === docFilter);
  }, [requirements, docFilter]);

  const filteredRegulatoryItems = useMemo(() => {
    if (!regulatoryItems) return [];
    if (regFilter === "ALL") return regulatoryItems;
    if (regFilter === REGULATORY_STATUS.OVERDUE) {
      return regulatoryItems.filter(
        (item) =>
          item.status === REGULATORY_STATUS.OVERDUE ||
          (item.sla_deadline &&
            item.sla_deadline < nowMs &&
            item.status !== REGULATORY_STATUS.APPROVED &&
            item.status !== REGULATORY_STATUS.WAIVED),
      );
    }
    return regulatoryItems.filter((item) => item.status === regFilter);
  }, [regulatoryItems, regFilter, nowMs]);

  const docCounts = useMemo(() => {
    if (!requirements) return null;
    const counts: Record<string, number> = { ALL: requirements.length };
    for (const r of requirements) {
      counts[r.overall_status] = (counts[r.overall_status] ?? 0) + 1;
    }
    return counts;
  }, [requirements]);

  const regCounts = useMemo(() => {
    if (!regulatoryItems) return null;
    const counts: Record<string, number> = { ALL: regulatoryItems.length };
    for (const item of regulatoryItems) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
      if (
        item.sla_deadline &&
        item.sla_deadline < nowMs &&
        item.status !== REGULATORY_STATUS.APPROVED &&
        item.status !== REGULATORY_STATUS.WAIVED &&
        item.status !== REGULATORY_STATUS.OVERDUE
      ) {
        counts[REGULATORY_STATUS.OVERDUE] = (counts[REGULATORY_STATUS.OVERDUE] ?? 0) + 1;
      }
    }
    return counts;
  }, [regulatoryItems, nowMs]);

  const isDocsLoading = requirements === undefined;
  const isRegLoading = regulatoryItems === undefined;

  return (
    <div className="space-y-4 text-base">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">Documents</h1>
        <p className="text-sm text-slate-500">Collect, verify, and track compliance items.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            activeTab === "documents"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          <FolderOpen className="size-4" />
          My Requirements
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("regulatory")}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            activeTab === "regulatory"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          <Shield className="size-4" />
          Regulatory
        </button>
      </div>

      {activeTab === "documents" ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {DOC_FILTERS.map((filterValue) => {
              const isActive = docFilter === filterValue;
              const count = docCounts?.[filterValue];
              return (
                <button
                  key={filterValue}
                  type="button"
                  onClick={() => setDocFilter(filterValue)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {docFilterLabel(filterValue)}
                  {count !== undefined ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>

          {isDocsLoading ? (
            <div className="space-y-2.5">
              {SKELETON_KEYS.map((key) => (
                <Card key={key} className="overflow-hidden rounded-xl border-slate-200">
                  <CardContent className="space-y-3 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <DocumentRequirementsList requirements={filteredRequirements} />
          )}

          {!isDocsLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FileText className="size-3.5" />
              Showing {filteredRequirements.length} requirement
              {filteredRequirements.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === "regulatory" ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {REG_FILTERS.map((filterValue) => {
              const isActive = regFilter === filterValue;
              const count = regCounts?.[filterValue];
              return (
                <button
                  key={filterValue}
                  type="button"
                  onClick={() => setRegFilter(filterValue)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {regFilterLabel(filterValue)}
                  {count !== undefined ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>

          {isRegLoading ? (
            <div className="space-y-2.5">
              {SKELETON_KEYS.map((key) => (
                <Card key={key} className="overflow-hidden rounded-xl border-slate-200">
                  <CardContent className="space-y-3 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredRegulatoryItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
              <Shield className="mx-auto mb-2 size-9 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No regulatory items</p>
              <p className="mt-1 text-xs text-slate-500">
                Regulatory items assigned to you will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRegulatoryItems.map((item) => (
                <RegulatorySlaCard key={item._id} item={item} />
              ))}
            </div>
          )}

          {!isRegLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Shield className="size-3.5" />
              Showing {filteredRegulatoryItems.length} item
              {filteredRegulatoryItems.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
