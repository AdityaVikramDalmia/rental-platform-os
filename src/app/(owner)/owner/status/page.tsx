"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function OwnerStatusPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/owner/dashboard");
  }, [router]);

  return null;
}
