"use client";

import { BlurFade } from "@/components/ui/blur-fade";

type SectionRevealProps = {
  children: React.ReactNode;
  delay?: number;
  className?: string;
};

export function SectionReveal({ children, delay = 0, className }: SectionRevealProps) {
  return (
    <BlurFade delay={delay} inView className={className}>
      {children}
    </BlurFade>
  );
}
