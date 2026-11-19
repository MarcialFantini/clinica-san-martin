import { esc } from './dom';

const MAX = 3;

export function toast(title: string, body = '', href?: string): void {
  const region = document.querySelector('[data-toasts]');
  if (!region) return;
  const el = document.createElement(href ? 'a' : 'div');
  el.className = 'toast';
  if (href && el instanceof HTMLAnchorElement) {
    el.href = href;
    el.style.textDecoration = 'none';
  }
  el.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg><span><strong>${esc(title)}</strong>${body ? `<br>${esc(body)}` : ''}</span>`;
  region.append(el);
  while (region.children.length > MAX) region.firstElementChild?.remove();
  window.setTimeout(() => {
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 280);
  }, 4200);
}
