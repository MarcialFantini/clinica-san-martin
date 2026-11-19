// Inicio: KPIs ticking, today's agenda, live activity feed, automations and recent inbox.
import { PRO_BY_ID, SPECIALTY_BY_ID } from '../../../data/catalog';
import { advance } from '../../../lib/engine';
import { getState, onEvent, subscribe } from '../../../lib/store';
import { clockLabel, dayOf, hhmm } from '../../../lib/time';
import type { AppState, AppointmentStatus } from '../../../lib/types';
import { $, avatar, esc, fmt, hueFor, keyed, tweenNumber } from '../dom';
import { toast } from '../toasts';
import { apptStatus, confirmationRate, convStatus, feedItem, flowRunPulse, refreshTimes } from './shared';

const STATUS_COLORS: Array<[AppointmentStatus, string, string]> = [
  ['atendido', 'var(--petrol)', 'Atendidos'],
  ['confirmado', 'var(--aqua)', 'Confirmados'],
  ['recordado', '#7fa7dc', 'Esperando respuesta'],
  ['pendiente', 'var(--surface-3)', 'Sin recordatorio aún'],
  ['reprogramado', '#e0a24f', 'Reprogramados'],
  ['cancelado', '#d9776e', 'Cancelados'],
  ['ausente', '#a2675f', 'Ausentes'],
];

export function mount(root: HTMLElement): () => void {
  const today = $('[data-slot="today"]', root)!;
  const feed = $('[data-slot="feed"]', root)!;
  const flows = $('[data-slot="flows"]', root)!;
  const inbox = $('[data-slot="inbox"]', root)!;
  feed.innerHTML = '';
  flows.innerHTML = '';
  inbox.innerHTML = '';

  const render = (s: AppState) => {
    tweenNumber($('[data-kpi="hours"]', root)!, Math.round(s.kpis.hoursSavedMonth));
    tweenNumber($('[data-kpi="reminders"]', root)!, s.kpis.remindersMonth);
    tweenNumber($('[data-kpi="rate"]', root)!, Math.round(confirmationRate(s)), { suffix: ' %' });
    tweenNumber($('[data-kpi="fast"]', root)!, s.kpis.answeredFastMonth);
    $('[data-kpi-note="reminders"]', root)!.textContent = `${fmt(s.stats.find((d) => d.day === dayOf(s.clock))?.reminders ?? 0)} hoy, sin tocar nada`;

    // Today
    const day = dayOf(s.clock);
    const appts = s.appointments.filter((a) => dayOf(a.start) === day);
    const count = (st: AppointmentStatus) => appts.filter((a) => a.status === st).length;
    const confirmed = count('confirmado') + count('atendido');
    const next = appts.filter((a) => a.start >= s.clock && a.status !== 'cancelado' && a.status !== 'reprogramado').sort((a, b) => a.start - b.start).slice(0, 6);
    today.innerHTML = `
      <div class="today-summary"><span class="big num">${confirmed}</span><span>de ${appts.length} turnos confirmados o atendidos</span></div>
      <div class="stackbar" role="img" aria-label="${STATUS_COLORS.map(([st, , l]) => `${l}: ${count(st)}`).join(', ')}">
        ${STATUS_COLORS.map(([st, c]) => `<span style="flex-grow:${count(st)};background:${c}"></span>`).join('')}
      </div>
      <ul class="legend">${STATUS_COLORS.filter(([st]) => count(st) > 0).map(([st, c, l]) => `<li><i style="background:${c}"></i>${l} <b class="num">${count(st)}</b></li>`).join('')}</ul>
      <h3 class="small muted" style="font-family:var(--font-text);font-weight:700;margin-bottom:4px">Próximos</h3>
      <ul class="next-list">${
        next.length
          ? next
              .map((a) => {
                const p = s.patients.find((x) => x.id === a.patientId);
                const pro = PRO_BY_ID[a.proId];
                return `<li><b>${hhmm(a.start)}</b><span class="ellipsis"><a href="/app/agenda/?turno=${a.id}">${esc(p?.name ?? '')}</a> <span class="muted">· ${esc(pro?.name ?? '')}, ${esc(pro ? SPECIALTY_BY_ID[pro.specialty].short : '')}</span></span>${apptStatus(a.status)}</li>`;
              })
              .join('')
          : '<li><span></span><span class="muted">No quedan turnos por hoy.</span><span></span></li>'
      }</ul>`;

    // Feed
    keyed(feed, s.activity.slice(0, 14), (a) => a.id, (a) => feedItem(a, s.clock), (a) => a.id, (el) => el.classList.add('fresh'));
    refreshTimes(feed, s.clock);

    // Flows
    keyed(
      flows,
      s.flows,
      (f) => f.id,
      (f) => `<li data-flow="${f.id}"><span class="flow-led ${f.active ? 'on' : ''}" aria-hidden="true"></span><a href="/app/flujos/editor/?id=${f.id}" class="ellipsis">${esc(f.name)}</a><span class="small muted"><b class="num" data-runs>${fmt(f.runs)}</b> ejecuciones</span></li>`,
      (f) => `${f.active}|${f.name}`,
    );
    for (const f of s.flows) {
      const el = flows.querySelector(`[data-flow="${f.id}"] [data-runs]`);
      if (el && el.textContent !== fmt(f.runs)) el.textContent = fmt(f.runs);
    }

    // Inbox
    keyed(
      inbox,
      s.conversations.slice(0, 5),
      (c) => c.id,
      (c) => {
        const p = s.patients.find((x) => x.id === c.patientId);
        const last = c.messages[c.messages.length - 1];
        return `<li>${avatar(p?.name ?? '?', hueFor(p?.name ?? ''))}<span class="ellipsis"><a href="/app/bandeja/?c=${c.id}"><b>${esc(p?.name ?? '')}</b></a><br><span class="muted small">${esc(last?.text ?? '')}</span></span>${convStatus(c.status)}</li>`;
      },
      (c) => `${c.updatedAt}|${c.status}|${c.messages.length}`,
      (el) => el.classList.add('flash'),
    );
  };

  render(getState());
  const unsub = subscribe(render);
  const unEvent = onEvent((e) => {
    if (e.type === 'flow-run') flowRunPulse(flows.querySelector(`[data-flow="${e.flowId}"] .flow-led`));
    if (e.type === 'kpi') {
      const key = e.key === 'remindersMonth' ? 'reminders' : e.key === 'confirmationsMonth' ? 'rate' : null;
      const el = key ? $(`[data-kpi="${key}"]`, root) : null;
      if (el) {
        el.classList.remove('tick');
        void el.offsetWidth;
        el.classList.add('tick');
      }
    }
  });
  const onClick = (ev: Event) => {
    if ((ev.target as Element).closest('[data-action="advance-day"]')) {
      advance(24 * 60);
      toast('Pasaron 24 horas', `Salieron los recordatorios del día siguiente. Ahora es ${clockLabel(getState().clock)}.`);
    }
  };
  root.addEventListener('click', onClick);
  return () => {
    unsub();
    unEvent();
    root.removeEventListener('click', onClick);
  };
}
