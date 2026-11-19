// Keyword classifier: turns a free-text patient message into a specialty (or null when unsure).
import { SPECIALTIES } from '../data/catalog';
import type { SpecialtyId } from './types';

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ');
}

export interface Classification {
  specialty: SpecialtyId | null;
  confidence: number;
  matched: string[];
}

export function classify(text: string): Classification {
  const words = ` ${normalize(text).replace(/\s+/g, ' ')} `;
  let best: { id: SpecialtyId; score: number; matched: string[] } | null = null;
  for (const s of SPECIALTIES) {
    const matched = s.keywords.filter((k) => words.includes(` ${k}`) || words.includes(`${k} `));
    const score = matched.length;
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score, matched };
  }
  if (!best) return { specialty: null, confidence: 0, matched: [] };
  return { specialty: best.id, confidence: Math.min(0.99, 0.62 + best.score * 0.14), matched: best.matched };
}
