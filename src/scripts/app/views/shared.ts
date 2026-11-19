// Render pieces shared by several views.
import { icon, type IconName } from '../../../lib/icons';
import { ago } from '../../../lib/time';
import type { Activity, AppState, AppointmentStatus, ConversationStatus, DayStats } from '../../../lib/types';
import { esc } from '../dom';

export const APPT_LABEL: Record<AppointmentStatus, string> = {
  pendiente: 'Sin recordatorio',
  recordado: 'Esperando respuesta',
  confirmado: 'Confirmado',
  reprogramado: 'Reprogramado',
  cancelado: 'Cancelado',
  atendido: 'Atendido',
  ausente: 'Ausente',
};

export const CONV_LABEL: Record<ConversationStatus, string> = {
  nueva: 'Nueva',
  derivada: 'Derivada',
  atencion: 'Para recepción',
  resuelta: 'Resuelta',
};

export const apptStatus = (st: AppointmentStatus): string => `<span class="status st-${st}">${APPT_LABEL[st]}</span>`;
export const convStatus = (st: ConversationStatus): string => `<span class="status st-${st}">${CONV_LABEL[st]}</span>`;

const FEED_ICON: Record<Activity['kind'], IconName> = {
  mensaje: 'inbox', recordatorio: 'bell', confirmacion: 'check', reprogramacion: 'calendar', cancelacion: 'close',
  derivacion: 'send', flujo: 'flow', campana: 'megaphone', atencion: 'users', sistema: 'bolt',
};

export function feedItem(a: Activity, now: number): string {
  const text = a.href ? `<a href="${esc(a.href)}">${esc(a.text)}</a>` : esc(a.text);
  return `<li class="k-${a.kind}"><span class="feed-icon">${icon(FEED_ICON[a.kind])}</span><span class="feed-text">${text}</span><time class="feed-time" data-at="${a.at}">${esc(ago(a.at, now))}</time></li>`;
}

/** Updates relative times in place without re-rendering the list. */
export function refreshTimes(root: ParentNode, now: number): void {
  for (const t of root.querySelectorAll<HTMLElement>('time[data-at]')) {
    const label = ago(Number(t.dataset.at), now);
    if (t.textContent !== label) t.textContent = label;
  }
}

export function totals(stats: DayStats[]) {
  return stats.reduce(
    (acc, d) => {
      acc.reminders += d.reminders;
      acc.confirmations += d.confirmations;
      acc.reschedules += d.reschedules;
      acc.cancellations += d.cancellations;
      acc.inquiries += d.inquiries;
      acc.responses += d.responses;
      acc.responseMinutesTotal += d.responseMinutesTotal;
      return acc;
    },
    { reminders: 0, confirmations: 0, reschedules: 0, cancellations: 0, inquiries: 0, responses: 0, responseMinutesTotal: 0 },
  );
}

/** Confirmation rate over the replies of the last 7 days. */
export function confirmationRate(s: AppState): number {
  const t = totals(s.stats.slice(-7));
  const base = t.confirmations + t.reschedules + t.cancellations;
  return base ? (t.confirmations / base) * 100 : 0;
}

export function flowRunPulse(el: Element | null): void {
  if (!el) return;
  el.classList.remove('fire');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('fire');
}
