const THRESHOLDS = [26, 51, 76, 90, 100, 105]; // limiares dos Tiers 1..6

export function calcularTier(points: number): number {
  if (points >= 105) return 6;
  if (points >= 100) return 5;
  if (points >= 90) return 4;
  if (points >= 76) return 3;
  if (points >= 51) return 2;
  if (points >= 26) return 1;
  return 0;
}

export function pointsToNextTier(points: number): number | null {
  const next = THRESHOLDS.find((t) => points < t);
  return next === undefined ? null : next - points;
}
