"use client";

import { Eye, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type SenderPreviewProps = {
  originalContent: string;
  maskedContent: string | undefined;
};

export function SenderPreview({ originalContent, maskedContent }: SenderPreviewProps) {
  if (!maskedContent || maskedContent === originalContent) {
    return null;
  }

  return (
    <Card className="mt-1.5 border-slate-200/60 bg-slate-50/80 shadow-none">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <Eye className="size-3" />
          <span>How others see your message</span>
        </div>

        <div className="space-y-1.5">
          <div className="rounded-lg bg-white/60 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Your original
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-400 line-through decoration-slate-300">
              {originalContent}
            </p>
          </div>

          <div className="rounded-lg bg-indigo-50/60 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-500">
              Recipients see
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-xs font-medium text-slate-800">
              {maskedContent}
            </p>
          </div>
        </div>

        <p className="flex items-center gap-1 text-[10px] text-slate-400">
          <Info className="size-2.5" />
          PII is masked for privacy. Recipients see the cleaned version.
        </p>
      </CardContent>
    </Card>
  );
}
