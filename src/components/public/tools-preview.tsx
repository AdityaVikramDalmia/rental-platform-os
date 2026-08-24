"use client";

import { motion } from "motion/react";
import { ArrowRight, Calculator, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { StaggerChildren } from "@/components/public/animations";

const COLOR_MAP = {
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-600",
    border: "hover:border-blue-200",
    hoverText: "group-hover:text-blue-700",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    border: "hover:border-emerald-200",
    hoverText: "group-hover:text-emerald-700",
  },
  purple: {
    bg: "bg-purple-50",
    text: "text-purple-600",
    border: "hover:border-purple-200",
    hoverText: "group-hover:text-purple-700",
  },
} as const;

type ColorKey = keyof typeof COLOR_MAP;

const TOOLS = [
  {
    icon: Calculator,
    title: "Rent Calculator",
    description:
      "Know your true move-in cost before you start looking. Factor in rent, deposit, brokerage, and setup expenses.",
    color: "blue" as ColorKey,
    href: "/tools#rent-calculator",
  },
  {
    icon: MapPin,
    title: "Commute Estimator",
    description:
      "Compare commute times from different areas to your workplace. Factor in metro, bus, and auto routes.",
    color: "emerald" as ColorKey,
    href: "/tools#commute-estimator",
  },
  {
    icon: Users,
    title: "Roommate Quiz",
    description:
      "Find out your roommate compatibility type. Match with like-minded flatmates based on lifestyle preferences.",
    color: "purple" as ColorKey,
    href: "/tools#roommate-quiz",
  },
];

export function ToolsPreview() {
  return (
    <StaggerChildren className="grid grid-cols-1 gap-6 md:grid-cols-3" staggerDelay={0.15}>
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const colors = COLOR_MAP[tool.color];

        return (
          <Link href={tool.href} key={tool.title}>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
              className={cn(
                "group relative cursor-pointer rounded-2xl border border-slate-100 bg-white p-6 transition-colors duration-300 lg:p-8",
                colors.border,
              )}
            >
              <div
                className={cn(
                  "mb-5 flex size-14 items-center justify-center rounded-2xl",
                  colors.bg,
                )}
              >
                <Icon className={cn("size-7", colors.text)} />
              </div>
              <h3
                className={cn(
                  "text-lg font-semibold text-slate-900 transition-colors",
                  colors.hoverText,
                )}
              >
                {tool.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{tool.description}</p>
              <div className={cn("mt-4 flex items-center text-sm font-medium", colors.text)}>
                Try it free{" "}
                <ArrowRight className="ml-1.5 size-4 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>
          </Link>
        );
      })}
    </StaggerChildren>
  );
}
