// Simulation time helpers. The clock counts minutes since Monday 16 Nov 2026, 00:00.
import { DAY_MIN, WEEK_START } from '../data/catalog';

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const dayOf = (min: number): number => Math.floor(min / DAY_MIN);
export const minuteOfDay = (min: number): number => ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
export const hourOf = (min: number): number => Math.floor(minuteOfDay(min) / 60);

export function dateOfDay(day: number): Date {
  return new Date(Date.UTC(WEEK_START.year, WEEK_START.month, WEEK_START.day + day));
}

export function hhmm(min: number): string {
  const m = minuteOfDay(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function dayLabel(day: number, style: 'long' | 'short' = 'long'): string {
  const d = dateOfDay(day);
  const name = (style === 'long' ? DAY_NAMES : DAY_SHORT)[d.getUTCDay()] ?? '';
  return style === 'long' ? `${name} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}` : `${name} ${d.getUTCDate()}`;
}

export function weekdayIndex(day: number): number {
  return dateOfDay(day).getUTCDay();
}

/** "hoy 14:30", "mañana 09:00", "jueves 19 · 10:15". */
export function relativeStamp(min: number, now: number): string {
  const d = dayOf(min);
  const today = dayOf(now);
  if (d === today) return `hoy ${hhmm(min)}`;
  if (d === today + 1) return `mañana ${hhmm(min)}`;
  if (d === today - 1) return `ayer ${hhmm(min)}`;
  return `${dayLabel(d, 'short')} · ${hhmm(min)}`;
}

/** "ahora", "hace 4 min", "hace 2 h", or a stamp. */
export function ago(min: number, now: number): string {
  const diff = now - min;
  if (diff < 1) return 'ahora';
  if (diff < 60) return `hace ${diff} min`;
  if (diff < 24 * 60) return `hace ${Math.floor(diff / 60)} h`;
  return relativeStamp(min, now);
}

export function clockLabel(min: number): string {
  return `${dayLabel(dayOf(min))} · ${hhmm(min)}`;
}
