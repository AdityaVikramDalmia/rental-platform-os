import { Badge } from "@/components/ui/badge";

const ACTOR_STYLES: Record<string, string> = {
  GUARD: "bg-blue-100 text-blue-700",
  ADMIN: "bg-purple-100 text-purple-700",
  SYSTEM: "bg-gray-100 text-gray-500",
};

type ActorBadgeProps = {
  name: string;
  actorType: string;
};

export function ActorBadge({ name, actorType }: ActorBadgeProps) {
  const displayName = actorType === "SYSTEM" ? "System" : name || "Unknown";
  const colorClass = ACTOR_STYLES[actorType] ?? "bg-gray-100 text-gray-500";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-700">{displayName}</span>
      <Badge className={colorClass}>{actorType}</Badge>
    </div>
  );
}
