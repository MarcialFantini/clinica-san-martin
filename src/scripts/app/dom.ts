// Tiny rendering helpers: escaping, keyed list reconciliation and number tweening.
import { PRO_BY_ID, SPECIALTY_BY_ID } from '../../data/catalog';
import type { SpecialtyId } from '../../lib/types';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(sel)];

export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fromHtml(html: string): Element {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as Element;
}

/**
 * Reconciles a container's children with a list of items by key. Only items whose
 * signature changed are re-rendered, so focus, scroll and running animations survive.
 */
export function keyed<T>(
  container: Element,
  items: T[],
  key: (item: T) => string,
  render: (item: T) => string,
  signature: (item: T) => string,
  onEnter?: (el: Element, item: T) => void,
): void {
  const existing = new Map<string, Element>();
  for (const child of [...container.children]) {
    const k = (child as HTMLElement).dataset.key;
    if (k) existing.set(k, child);
    else child.remove();
  }
  const firstRender = existing.size === 0;
  let prev: Element | null = null;
  const keep = new Set<string>();
  for (const item of items) {
    const k = key(item);
    keep.add(k);
    const sig = signature(item);
    let el = existing.get(k);
    if (!el || (el as HTMLElement).dataset.sig !== sig) {
      const fresh = fromHtml(render(item)) as HTMLElement;
      fresh.dataset.key = k;
      fresh.dataset.sig = sig;
      if (el) {
        el.replaceWith(fresh);
      } else if (!firstRender && onEnter) {
        onEnter(fresh, item);
      }
      el = fresh;
    }
    const expected: Element | null = prev ? prev.nextElementSibling : container.firstElementChild;
    if (expected !== el) {
      if (prev) prev.after(el);
      else container.prepend(el);
    }
    prev = el;
  }
  for (const [k, el] of existing) if (!keep.has(k)) el.remove();
}

/** Animates a number inside an element (transform-free; text only). */
export function tweenNumber(el: HTMLElement, to: number, opts: { decimals?: number; duration?: number; suffix?: string } = {}): void {
  const { decimals = 0, duration = 700, suffix = '' } = opts;
  const from = Number(el.dataset.value ?? to);
  el.dataset.value = String(to);
  const fmt = (n: number) => `${n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  if (from === to || reducedMotion()) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function pct(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)} %` : '—';
}

export function specTag(id: SpecialtyId | null | undefined): string {
  if (!id) return '<span class="tag" style="--h:20">Sin clasificar</span>';
  const s = SPECIALTY_BY_ID[id];
  return `<span class="tag" style="--h:${s.hue}">${esc(s.name)}</span>`;
}

export function proName(id: string | null | undefined): string {
  return id ? (PRO_BY_ID[id]?.name ?? '') : '';
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function avatar(name: string, hue = 190): string {
  return `<span class="avatar" style="--h:${hue}" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function query(name: string): string | null {
  return new URL(location.href).searchParams.get(name);
}

export function setQuery(name: string, value: string | null): void {
  const url = new URL(location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  history.replaceState(history.state, '', url);
}

export function hueFor(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
