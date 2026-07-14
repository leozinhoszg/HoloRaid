import { createHash } from 'node:crypto';
import { generateRefreshToken, hashToken, randomState, createPkcePair } from '../src/common/security/tokens';

describe('tokens', () => {
  it('gera refresh tokens únicos e não triviais', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it('hashToken é SHA-256 hex determinístico', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(hashToken('abc')).toHaveLength(64);
  });

  it('PKCE: challenge é base64url(SHA256(verifier))', () => {
    const { verifier, challenge } = createPkcePair();
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });
});
