"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../../../convex/_generated/api";
import { USER_TYPE } from "../../../../../lib/constants";

export default function GuardOnboardingPage() {
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);

  useEffect(() => {
    if (currentUser === undefined) {
      return;
    }

    if (currentUser === null) {
      router.replace("/guard/login");
      return;
    }

    if (currentUser.user_type === USER_TYPE.OPS) {
      router.replace("/guard/unauthorized");
      return;
    }

    if (currentUser.user_type === USER_TYPE.GUARD) {
      router.replace("/guard/dashboard");
      return;
    }

    router.replace("/guard/login");
  }, [currentUser, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
        <Loader2 className="size-4 animate-spin" />
        Redirecting...
      </div>
    </div>
  );
}
