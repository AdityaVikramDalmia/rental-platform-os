export const KPI_METRICS = [
  {
    value: "visits_completed",
    label: "Visits Completed",
    description: "Total visits marked complete",
    direction: "HIGHER_BETTER" as const,
    unit: "count",
  },
  {
    value: "closures_confirmed",
    label: "Closures Confirmed",
    description: "Confirmed deal closures",
    direction: "HIGHER_BETTER" as const,
    unit: "count",
  },
  {
    value: "leads_verified",
    label: "Leads Verified",
    description: "Leads that passed verification",
    direction: "HIGHER_BETTER" as const,
    unit: "count",
  },
  {
    value: "quality_score_min",
    label: "Min Quality Score",
    description: "Minimum quality score to maintain",
    direction: "HIGHER_BETTER" as const,
    unit: "score",
  },
  {
    value: "checklist_approval_rate",
    label: "Checklist Approval Rate",
    description: "Percentage of checklists approved",
    direction: "HIGHER_BETTER" as const,
    unit: "percent",
  },
  {
    value: "document_collection_rate",
    label: "Document Collection Rate",
    description: "Percentage of required documents collected",
    direction: "HIGHER_BETTER" as const,
    unit: "percent",
  },
  {
    value: "negotiation_closures",
    label: "Negotiation Closures",
    description: "Negotiations reaching CLOSED status",
    direction: "HIGHER_BETTER" as const,
    unit: "count",
  },
  {
    value: "visit_no_show_rate_max",
    label: "Visit No-Show Rate (Max)",
    description: "Maximum acceptable no-show rate",
    direction: "LOWER_BETTER" as const,
    unit: "percent",
  },
  {
    value: "tenant_inquiry_resolutions",
    label: "Tenant Inquiry Resolutions",
    description: "Inquiries resolved to completion",
    direction: "HIGHER_BETTER" as const,
    unit: "count",
  },
] as const;

export type KpiMetricKey = (typeof KPI_METRICS)[number]["value"];

export function getMetricLabel(metric: string): string {
  return KPI_METRICS.find((m) => m.value === metric)?.label ?? metric;
}

export function getMetricDirection(metric: string): "HIGHER_BETTER" | "LOWER_BETTER" {
  return KPI_METRICS.find((m) => m.value === metric)?.direction ?? "HIGHER_BETTER";
}
