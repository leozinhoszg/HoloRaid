import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz'; // sem 0/O/1/I/l

export function generateRaidCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function defaultSlots(size: number): { slots_tank: number; slots_heal: number; slots_dps: number } {
  if (size === 16) return { slots_tank: 2, slots_heal: 4, slots_dps: 10 };
  return { slots_tank: 2, slots_heal: 2, slots_dps: 4 }; // 8
}
