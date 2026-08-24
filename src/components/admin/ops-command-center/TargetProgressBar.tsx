import { cn } from "@/lib/utils";

type TargetProgressBarProps = {
  progress: number | null;
  status: string;
};

function getProgressColor(progress: number | null): string {
  if (progress === null || Number.isNaN(progress)) {
    return "bg-slate-300";
  }

  if (progress >= 80) {
    return "bg-emerald-500";
  }

  if (progress >= 50) {
    return "bg-amber-500";
  }

  return "bg-red-500";
}

export function TargetProgressBar({ progress, status }: TargetProgressBarProps) {
  const safeProgress = progress === null || Number.isNaN(progress) ? null : Math.max(0, progress);
  const clampedProgress = safeProgress === null ? 0 : Math.min(safeProgress, 100);

  return (
    <div className="flex min-w-[170px] items-center gap-2">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full transition-all", getProgressColor(safeProgress))}
          style={{ width: `${clampedProgress}%` }}
          title={`${safeProgress ?? 0}% ${status}`}
        />
      </div>
      <span className="w-12 text-right text-xs font-medium text-slate-700">
        {safeProgress === null ? "--" : `${safeProgress.toFixed(1)}%`}
      </span>
    </div>
  );
}
