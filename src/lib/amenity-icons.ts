import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Building2,
  Camera,
  Car,
  CircleDot,
  CloudRain,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Fuel,
  Phone,
  ShieldCheck,
  TreePine,
  Users,
  Waves,
  Zap,
} from "lucide-react";

export const AMENITY_ICONS: Record<string, LucideIcon> = {
  gym: Dumbbell,
  pool: Waves,
  garden: TreePine,
  security: ShieldCheck,
  lift: Building2,
  power_backup: Zap,
  clubhouse: Users,
  parking: Car,
  play_area: Baby,
  jogging_track: Footprints,
  intercom: Phone,
  cctv: Camera,
  fire_safety: Flame,
  water_supply_24x7: Droplets,
  gas_pipeline: Fuel,
  rain_water_harvesting: CloudRain,
};

export const AMENITY_LABELS: Record<string, string> = {
  gym: "Gym",
  pool: "Pool",
  garden: "Garden",
  security: "Security",
  lift: "Lift",
  power_backup: "Power Backup",
  clubhouse: "Clubhouse",
  parking: "Parking",
  play_area: "Play Area",
  jogging_track: "Jogging Track",
  intercom: "Intercom",
  cctv: "CCTV",
  fire_safety: "Fire Safety",
  water_supply_24x7: "24/7 Water",
  gas_pipeline: "Gas Pipeline",
  rain_water_harvesting: "Rainwater Harvesting",
};

export function getAmenityIcon(amenity: string): LucideIcon {
  return AMENITY_ICONS[amenity] ?? CircleDot;
}

export function getAmenityLabel(amenity: string): string {
  return (
    AMENITY_LABELS[amenity] ?? amenity.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}
