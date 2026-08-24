"use client";

import React from "react";
import { BlurFade } from "@/components/ui/blur-fade";

type StaggerChildrenProps = {
  children: React.ReactNode;
  baseDelay?: number;
  staggerDelay?: number;
  className?: string;
};

export function StaggerChildren({
  children,
  baseDelay = 0,
  staggerDelay = 0.05,
  className,
}: StaggerChildrenProps) {
  const items = React.Children.toArray(children);

  return (
    <div className={className}>
      {items.map((child, index) => {
        const key =
          React.isValidElement(child) && child.key != null ? child.key : `stagger-${index}`;
        return (
          <BlurFade key={key} delay={baseDelay + index * staggerDelay} inView>
            {child}
          </BlurFade>
        );
      })}
    </div>
  );
}
