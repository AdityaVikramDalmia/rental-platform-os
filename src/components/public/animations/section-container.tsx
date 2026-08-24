import { cn } from "@/lib/utils";

type SectionContainerProps = {
  children: React.ReactNode;
  className?: string;
  id?: string;
  fullWidth?: boolean;
};

export function SectionContainer({
  children,
  className,
  id,
  fullWidth = false,
}: SectionContainerProps) {
  return (
    <section id={id} className={cn("py-16 lg:py-24", className)}>
      {fullWidth ? (
        children
      ) : (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
      )}
    </section>
  );
}
