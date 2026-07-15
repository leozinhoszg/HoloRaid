import { calcularTier, pointsToNextTier } from '../src/common/progression/tier';

describe('calcularTier', () => {
  it.each([
    [0, 0], [25, 0], [26, 1], [50, 1], [51, 2], [75, 2],
    [76, 3], [89, 3], [90, 4], [99, 4], [100, 5], [104, 5], [105, 6], [999, 6],
  ])('points=%i -> tier %i', (points, tier) => {
    expect(calcularTier(points)).toBe(tier);
  });
});

describe('pointsToNextTier', () => {
  it('0 pontos faltam 26 para o Tier 1', () => expect(pointsToNextTier(0)).toBe(26));
  it('90 pontos faltam 10 para o Tier 5', () => expect(pointsToNextTier(90)).toBe(10));
  it('105 pontos: já no máximo (null)', () => expect(pointsToNextTier(105)).toBeNull());
});
