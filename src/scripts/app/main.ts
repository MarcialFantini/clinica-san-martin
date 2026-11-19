// App entry. Runs once: the shell persists across client-side navigations, so the store and
// the simulation keep running while views mount and unmount on every page load.
import { navigate } from 'astro:transitions/client';
import { advance, resyncEngine, setPaused, setSpeed, startEngine } from '../../lib/engine';
import { NAV, isActive } from '../../lib/nav';
import { getState, initStore, isPersistent, mutate, onEvent, resetDemo, subscribe } from '../../lib/store';
import { ago, clockLabel, dayLabel, dayOf, hhmm } from '../../lib/time';
import type { AppState, Speed } from '../../lib/types';
import { $, $$, esc, reducedMotion } from './dom';
import { initPalette, openPalette } from './palette';
import { toast } from './toasts';
import { startShowcase } from './showcase';

type Cleanup = () => void;
type ViewModule = { mount: (root: HTMLElement) => Cleanup | void };

const VIEWS: Record<string, () => Promise<ViewModule>> = {
  panel: () => import('./views/panel'),
  bandeja: () => import('./views/inbox'),
  pacientes: () => import('./views/patients'),
  ficha: () => import('./views/patient'),
  agenda: () => import('./views/agenda'),
  flujos: () => import('./views/flows'),
  editor: () => import('./views/editor'),
  plantillas: () => import('./views/templates'),
  campanas: () => import('./views/campaigns'),
  metricas: () => import('./views/metrics'),
};

const showcase = new URL(location.href).searchParams.has('showcase');
initStore({ showcase, reducedMotion: reducedMotion() });
startEngine();

let cleanup: Cleanup | null = null;
let mountToken = 0;

async function mountView(): Promise<void> {
  cleanup?.();
  cleanup = null;
  const token = ++mountToken;
  const view = document.body.dataset.view ?? 'panel';
  const root = $<HTMLElement>('[data-view-root]');
  syncNav(view);
  renderShell(getState());
  if (!root) return;
  const loader = VIEWS[view];
  if (!loader) return;
  const mod = await loader();
  if (token !== mountToken) return;
  const result = mod.mount(root);
  root.dataset.ready = 'true';
  cleanup = typeof result === 'function' ? result : null;
}

function syncNav(view: string): void {
  for (const a of $$<HTMLAnchorElement>('[data-nav]')) {
    const item = NAV.find((n) => n.view === a.dataset.nav);
    if (item && isActive(item, view)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

// ---------------------------------------------------------------------------
// Shell rendering: clock, live state, speed, counters, notifications.

let lastNoticeCount = -1;

function renderShell(s: AppState): void {
  const shell = $('.shell');
  if (shell) shell.dataset.paused = String(s.sim.paused);
  for (const el of $$('[data-clock]')) el.innerHTML = `<span class="clock-day">${dayLabel(dayOf(s.clock), 'short')} · </span>${hhmm(s.clock)}`;
  for (const el of $$('[data-live-label]')) el.textContent = s.sim.paused ? 'PAUSA' : 'EN VIVO';
  for (const b of $$<HTMLButtonElement>('[data-action="toggle-pause"]')) {
    b.setAttribute('aria-label', s.sim.paused ? 'Reanudar simulación' : 'Pausar simulación');
    b.title = s.sim.paused ? 'Reanudar (P)' : 'Pausar (P)';
    b.innerHTML = s.sim.paused
      ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>'
      : '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>';
  }
  for (const b of $$<HTMLButtonElement>('[data-speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s.sim.speed));
  const inbox = s.conversations.reduce((n, c) => n + (c.unread > 0 && c.status !== 'resuelta' ? 1 : 0), 0);
  for (const el of $$('[data-count="inbox"]')) el.textContent = inbox ? String(inbox) : '';
  const unread = s.notices.filter((n) => !n.read).length;
  for (const el of $$('[data-count="notices"]')) {
    el.textContent = unread ? String(unread > 99 ? '99+' : unread) : '';
    if (lastNoticeCount >= 0 && unread > lastNoticeCount) {
      el.classList.remove('bump');
      void (el as HTMLElement).offsetWidth;
      el.classList.add('bump');
    }
  }
  const bell = $('[data-action="notifications"]');
  bell?.setAttribute('aria-label', unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones');
  lastNoticeCount = unread;
  if ($('#notif-panel')?.classList.contains('open')) renderNotices(s);
}

function renderNotices(s: AppState): void {
  const list = $('[data-notif-list]');
  if (!list) return;
  list.innerHTML = s.notices.length
    ? s.notices
        .slice(0, 30)
        .map(
          (n) => `<li><a class="notif ${n.read ? '' : 'unread'} t-${n.tone}" href="${esc(n.href ?? '/app/')}" data-notice="${n.id}">
            <span class="notif-dot" aria-hidden="true"></span>
            <span><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><time>${esc(ago(n.at, s.clock))}</time>${n.read ? '' : '<span class="sr-only"> (sin leer)</span>'}</span>
          </a></li>`,
        )
        .join('')
    : '<li class="empty">Sin notificaciones.</li>';
}

subscribe(renderShell);

// Toasts for important live events, rate limited.
let lastToast = 0;
onEvent((e) => {
  if (e.type === 'reset') {
    resyncEngine();
    void mountView();
    return;
  }
  if (e.type !== 'notice') return;
  const now = performance.now();
  if (now - lastToast < 3500) return;
  const n = getState().notices.find((x) => x.id === e.noticeId);
  if (!n) return;
  lastToast = now;
  toast(n.title, n.body, n.href);
});

// ---------------------------------------------------------------------------
// Panels

const overlay = () => $('[data-overlay]');

function closePanels(): void {
  $('#notif-panel')?.classList.remove('open');
  $('#more-sheet')?.classList.remove('open');
  overlay()?.classList.remove('open');
  $('[data-action="notifications"]')?.setAttribute('aria-expanded', 'false');
  $('[data-action="more"]')?.setAttribute('aria-expanded', 'false');
}

function toggleNotifications(): void {
  const panel = $('#notif-panel');
  if (!panel) return;
  const open = !panel.classList.contains('open');
  closePanels();
  if (open) {
    renderNotices(getState());
    panel.classList.add('open');
    overlay()?.classList.add('open');
    $('[data-action="notifications"]')?.setAttribute('aria-expanded', 'true');
    panel.focus();
  }
}

function toggleSheet(): void {
  const sheet = $('#more-sheet');
  if (!sheet) return;
  const open = !sheet.classList.contains('open');
  closePanels();
  if (open) {
    sheet.classList.add('open');
    overlay()?.classList.add('open');
    $('[data-action="more"]')?.setAttribute('aria-expanded', 'true');
    sheet.focus();
  }
}

export function askReset(): void {
  const d = $<HTMLDialogElement>('#confirm-reset');
  closePanels();
  d?.showModal();
}

function doReset(): void {
  $<HTMLDialogElement>('#confirm-reset')?.close();
  resetDemo();
  toast('Demo reiniciada', isPersistent() ? 'La clínica volvió al lunes 16 a las 09:12.' : 'Estado limpio de la vitrina.');
}

const SPEEDS: Speed[] = [1, 4, 10];

export function cycleSpeed(): void {
  const s = getState();
  const next = SPEEDS[(SPEEDS.indexOf(s.sim.speed) + 1) % SPEEDS.length] ?? 1;
  setSpeed(next);
  toast(`Velocidad ${next}x`, `Cada segundo real son ${next} minutos de la clínica.`);
}

export function togglePause(): void {
  setPaused(!getState().sim.paused);
}

export function advanceHour(hours = 1): void {
  advance(hours * 60);
  toast(`Reloj adelantado ${hours} h`, `Ahora es ${clockLabel(getState().clock)}.`);
}

document.addEventListener('click', (ev) => {
  const target = ev.target as Element;
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  const speed = target.closest<HTMLElement>('[data-speed]')?.dataset.speed;
  if (speed) {
    setSpeed(Number(speed) as Speed);
    return;
  }
  if (target.closest('[data-notice]')) {
    const id = target.closest<HTMLElement>('[data-notice]')?.dataset.notice;
    mutate((s) => {
      const n = s.notices.find((x) => x.id === id);
      if (n) n.read = true;
    });
    closePanels();
    return;
  }
  if (target.closest('[data-close]')) {
    target.closest('dialog')?.close();
    return;
  }
  if (target.matches('dialog.modal')) {
    // Click on the backdrop.
    (target as HTMLDialogElement).close();
    return;
  }
  switch (action) {
    case 'toggle-pause': togglePause(); break;
    case 'advance': advanceHour(1); break;
    case 'notifications': toggleNotifications(); break;
    case 'more': toggleSheet(); break;
    case 'close-sheet': closePanels(); break;
    case 'read-all':
      mutate((s) => s.notices.forEach((n) => (n.read = true)));
      renderNotices(getState());
      break;
    case 'reset': askReset(); break;
    case 'reset-confirm': doReset(); break;
    case 'palette': openPalette(); break;
    default:
      if (target.closest('[data-overlay]')) closePanels();
  }
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts

let gPending = 0;
function typing(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}

document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault();
    openPalette();
    return;
  }
  if (ev.key === 'Escape') {
    closePanels();
    return;
  }
  if (typing(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const key = ev.key.toLowerCase();
  if (gPending && performance.now() - gPending < 1200) {
    gPending = 0;
    const item = NAV.find((n) => n.key === key);
    if (item) {
      ev.preventDefault();
      void navigate(item.href);
    }
    return;
  }
  // Views can claim keys (the flow editor uses arrows, Delete, Enter).
  if ((ev.target as HTMLElement | null)?.closest('[data-keys-local]')) return;
  switch (key) {
    case 'g': gPending = performance.now(); break;
    case '?': ev.preventDefault(); $<HTMLDialogElement>('#help')?.showModal(); break;
    case 'p': togglePause(); break;
    case 's': cycleSpeed(); break;
    case '+': advanceHour(1); break;
    case 'n': toggleNotifications(); break;
    case '/': {
      const search = $<HTMLInputElement>('[data-view-root] input[type="search"]');
      if (search) {
        ev.preventDefault();
        search.focus();
      }
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Navigation lifecycle

initPalette({ togglePause, cycleSpeed, advanceHour, askReset, openHelp: () => $<HTMLDialogElement>('#help')?.showModal() });

document.addEventListener('astro:before-swap', () => {
  cleanup?.();
  cleanup = null;
  closePanels();
});
document.addEventListener('astro:page-load', () => {
  void mountView();
});

if (showcase) {
  document.documentElement.classList.add('showcase');
  startShowcase();
}
