export const BANGALORE_AREAS = [
  "Koramangala",
  "Indiranagar",
  "HSR Layout",
  "Whitefield",
  "Electronic City",
  "Marathahalli",
  "JP Nagar",
  "Jayanagar",
  "Hebbal",
  "Yelahanka",
] as const;

export type BangaloreArea = (typeof BANGALORE_AREAS)[number];

export const TRANSPORT_MODES = {
  DRIVE: { label: "Drive", minutesPerKm: 3 },
  BIKE: { label: "Bike", minutesPerKm: 2.5 },
  BUS: { label: "Bus", minutesPerKm: 5 },
  METRO: { label: "Metro", minutesPerKm: 2 },
  WALK: { label: "Walk", minutesPerKm: 12 },
} as const;

export type TransportMode = keyof typeof TRANSPORT_MODES;

export type CommuteEstimate = {
  distanceKm: number;
  timeMinutes: number;
};

const AREA_COORDINATES: Record<BangaloreArea, { x: number; y: number }> = {
  Koramangala: { x: 0, y: 0 },
  Indiranagar: { x: 4, y: 3 },
  "HSR Layout": { x: -1, y: -3 },
  Whitefield: { x: 14, y: 4 },
  "Electronic City": { x: 1, y: -11 },
  Marathahalli: { x: 8, y: 2 },
  "JP Nagar": { x: -4, y: -5 },
  Jayanagar: { x: -3, y: -2 },
  Hebbal: { x: 2, y: 10 },
  Yelahanka: { x: 3, y: 18 },
};

export const COMMUTE_DISTANCE_MATRIX: Record<
  BangaloreArea,
  Record<BangaloreArea, number>
> = BANGALORE_AREAS.reduce(
  (matrix, fromArea) => {
    matrix[fromArea] = BANGALORE_AREAS.reduce(
      (innerMatrix, toArea) => {
        const from = AREA_COORDINATES[fromArea];
        const to = AREA_COORDINATES[toArea];
        const euclideanDistance = Math.hypot(from.x - to.x, from.y - to.y);

        innerMatrix[toArea] = Number(euclideanDistance.toFixed(1));
        return innerMatrix;
      },
      {} as Record<BangaloreArea, number>,
    );

    return matrix;
  },
  {} as Record<BangaloreArea, Record<BangaloreArea, number>>,
);

export function estimateCommute(
  fromArea: BangaloreArea,
  toArea: BangaloreArea,
  mode: TransportMode,
): CommuteEstimate | null {
  const distanceKm = COMMUTE_DISTANCE_MATRIX[fromArea]?.[toArea];

  if (distanceKm === undefined) {
    return null;
  }

  const minutesPerKm = TRANSPORT_MODES[mode].minutesPerKm;

  return {
    distanceKm,
    timeMinutes: Math.round(distanceKm * minutesPerKm),
  };
}
