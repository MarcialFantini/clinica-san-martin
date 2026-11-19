// Agenda: 40 professionals on a live timeline (or an hour-grouped list), day tabs, status filter
// and a drawer to act on any appointment.
import { DAY_MIN, PROFESSIONALS, PRO_BY_ID, SPECIALTY_BY_ID } from '../../../data/catalog';
import { icon } from '../../../lib/icons';
import { addActivity, conversationFor, findFreeSlot, flowFor, flowTemplate, nextId, patientById, runFlow, sendTemplate } from '../../../lib/ops';
import { getState, mutate, onEvent, subscribe } from '../../../lib/store';
import { fillTemplate, varsFor } from '../../../lib/templating';
import { dayLabel, dayOf, hhmm, relativeStamp, weekdayIndex } from '../../../lib/time';
import type { AppState, Appointment, AppointmentStatus, SimEvent, SpecialtyId } from '../../../lib/types';
import { $, $$, esc, query, setQuery } from '../dom';
import { toast } from '../toasts';
import { APPT_LABEL, apptStatus } from './shared';

const START_H = 8;
const SPAN_MIN = 12 * 60;
const STATUSES: AppointmentStatus[] = ['confirmado', 'recordado', 'pendiente', 'atendido', 'reprogramado', 'cancelado', 'ausente'];
const SWATCH: Record<AppointmentStatus, string> = {
  pendiente: 'var(--surface-3)', recordado: '#9dbbe6', confirmado: 'var(--aqua)', atendido: 'var(--petrol)', reprogramado: '#e7b56f', cancelado: '#f1c3be', ausente: '#b88079',
};

export function mount(root: HTMLElement): () => void {
  const daysEl = $('[data-days]', root)!;
  const spec = $<HTMLSelectElement>('[data-spec]', root)!;
  const summary = $('[data-summary]', root)!;
  const gantt = $('[data-gantt]', root)!;
  const listEl = $('[data-list]', root)!;
  const drawer = $('[data-drawer]', root)!;
  const drawerBody = $('[data-drawer-body]', root)!;
  const mobile = window.matchMedia('(max-width: 720px)');

  let mode: 'timeline' | 'list' = mobile.matches ? 'list' : 'timeline';
  let statusFilter: AppointmentStatus | null = null;
  let openId: string | null = query('turno');
  const initial = getState();
  let day = dayOf(initial.clock);
  if (openId) {
    const a = initial.appointments.find((x) => x.id === openId);
    if (a) day = dayOf(a.start);
  }
  if (query('dia')) day = Number(query('dia'));
  let builtFor = '';

  const weekDays = (s: AppState) => {
    const today = dayOf(s.clock);
    const monday = today - ((weekdayIndex(today) + 6) % 7);
    return [0, 1, 2, 3, 4, 5].map((i) => monday + i);
  };

  const pros = () => (spec.value ? PROFESSIONALS.filter((p) => p.specialty === (spec.value as SpecialtyId)) : PROFESSIONALS);

  const dayAppts = (s: AppState) => {
    const ids = new Set(pros().map((p) => p.id));
    return s.appointments.filter((a) => dayOf(a.start) === day && ids.has(a.proId));
  };

  const renderDays = (s: AppState) => {
    const today = dayOf(s.clock);
    const sig = `${weekDays(s).join(',')}|${day}|${today}`;
    if (daysEl.dataset.sig === sig) return;
    daysEl.dataset.sig = sig;
    daysEl.innerHTML = weekDays(s)
      .map((d) => `<button type="button" role="tab" data-day="${d}" aria-selected="${d === day}" tabindex="${d === day ? 0 : -1}">${esc(dayLabel(d, 'short'))}${d === today ? '<span class="today-dot" aria-label="hoy"></span>' : ''}</button>`)
      .join('');
  };

  const renderSummary = (appts: Appointment[]) => {
    const counts = new Map<AppointmentStatus, number>();
    for (const a of appts) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    const sig = `${STATUSES.map((st) => counts.get(st) ?? 0).join(',')}|${statusFilter}`;
    if (summary.dataset.sig === sig) return;
    summary.dataset.sig = sig;
    summary.innerHTML =
      `<li><b class="num">${appts.length}</b>&nbsp;turnos</li>` +
      STATUSES.filter((st) => counts.get(st))
        .map((st) => `<li><button type="button" data-status="${st}" aria-pressed="${statusFilter === st}"><i style="background:${SWATCH[st]};width:10px;height:10px;border-radius:3px;display:inline-block"></i>${APPT_LABEL[st]} <b class="num">${counts.get(st)}</b></button></li>`)
        .join('');
  };

  const pos = (start: number) => ((start - day * DAY_MIN - START_H * 60) / SPAN_MIN) * 100;

  const buildTimeline = (s: AppState, appts: Appointment[]) => {
    const byPro = new Map<string, Appointment[]>();
    for (const a of appts) byPro.set(a.proId, [...(byPro.get(a.proId) ?? []), a]);
    const hours = Array.from({ length: 13 }, (_, i) => `<span style="left:${(i / 12) * 100}%">${START_H + i}:00</span>`).join('');
    gantt.innerHTML = `<div class="g-hours" aria-hidden="true"><span></span><div class="g-hours-track">${hours}</div></div>
      ${pros()
        .map((p) => {
          const items = (byPro.get(p.id) ?? []).map((a) => apptButton(s, a)).join('');
          return `<div class="g-row"><div class="g-pro ellipsis">${esc(p.name)}<br><small>${esc(SPECIALTY_BY_ID[p.specialty].name)}</small></div><div class="g-track" role="group" aria-label="Turnos de ${esc(p.name)}">${items}</div></div>`;
        })
        .join('')}
      <div class="g-now-wrap"><div class="g-now" data-now hidden></div></div>`;
  };

  const apptButton = (s: AppState, a: Appointment) => {
    const p = patientById(s, a.patientId);
    const dim = statusFilter && a.status !== statusFilter ? ' dim' : '';
    return `<button type="button" class="g-appt ${a.status}${dim}" data-appt="${a.id}" style="left:${pos(a.start)}%;width:calc(${(a.duration / SPAN_MIN) * 100}% - 2px)" aria-label="${hhmm(a.start)} ${esc(p?.name ?? '')}, ${APPT_LABEL[a.status]}" title="${hhmm(a.start)} · ${esc(p?.name ?? '')} · ${APPT_LABEL[a.status]}"></button>`;
  };

  const buildList = (s: AppState, appts: Appointment[]) => {
    const sorted = appts.filter((a) => !statusFilter || a.status === statusFilter).sort((a, b) => a.start - b.start);
    const groups = new Map<number, Appointment[]>();
    for (const a of sorted) {
      const h = Math.floor((a.start - day * DAY_MIN) / 60);
      groups.set(h, [...(groups.get(h) ?? []), a]);
    }
    listEl.innerHTML = sorted.length
      ? [...groups.entries()]
          .map(
            ([h, items]) => `<h2 class="alist-hour">${String(h).padStart(2, '0')}:00</h2><ul>${items
              .map((a) => {
                const p = patientById(s, a.patientId);
                const pro = PRO_BY_ID[a.proId];
                return `<li><button type="button" class="alist-item" data-appt="${a.id}"><b>${hhmm(a.start)}</b><span class="ellipsis">${esc(p?.name ?? '')}<small class="ellipsis">${esc(pro?.name ?? '')} · ${esc(pro ? SPECIALTY_BY_ID[pro.specialty].short : '')}</small></span>${apptStatus(a.status)}</button></li>`;
              })
              .join('')}</ul>`,
          )
          .join('')
      : '<p class="empty">No hay turnos para este filtro.</p>';
  };

  const render = (s: AppState) => {
    renderDays(s);
    const appts = dayAppts(s);
    renderSummary(appts);
    gantt.hidden = mode !== 'timeline';
    listEl.hidden = mode !== 'list';
    const key = `${mode}|${day}|${spec.value}|${statusFilter}|${s.generatedDays}`;
    if (mode === 'timeline') {
      if (builtFor !== key) {
        buildTimeline(s, appts);
        builtFor = key;
      } else {
        // Patch only what changed so animations and focus survive.
        for (const a of appts) {
          const el = gantt.querySelector<HTMLElement>(`[data-appt="${a.id}"]`);
          if (!el) {
            builtFor = '';
            continue;
          }
          if (!el.classList.contains(a.status)) {
            const p = patientById(s, a.patientId);
            el.className = `g-appt ${a.status} changed${statusFilter && a.status !== statusFilter ? ' dim' : ''}`;
            el.setAttribute('aria-label', `${hhmm(a.start)} ${p?.name ?? ''}, ${APPT_LABEL[a.status]}`);
            el.title = `${hhmm(a.start)} · ${p?.name ?? ''} · ${APPT_LABEL[a.status]}`;
          }
        }
      }
      const now = $<HTMLElement>('[data-now]', gantt);
      if (now) {
        const x = pos(s.clock);
        now.hidden = !(dayOf(s.clock) === day && x >= 0 && x <= 100);
        now.style.left = `${x}%`;
        now.dataset.label = hhmm(s.clock);
      }
    } else {
      const sig = `${key}|${appts.map((a) => a.status).join('')}`;
      if (listEl.dataset.sig !== sig) {
        listEl.dataset.sig = sig;
        buildList(s, appts);
      }
    }
    if (openId) renderDrawer(s);
  };

  const renderDrawer = (s: AppState) => {
    const a = s.appointments.find((x) => x.id === openId);
    if (!a) return;
    const p = patientById(s, a.patientId);
    const pro = PRO_BY_ID[a.proId];
    const sig = `${a.id}|${a.status}|${a.remindedAt}`;
    if (drawerBody.dataset.sig === sig) return;
    drawerBody.dataset.sig = sig;
    const tpl = s.templates.find((t) => t.id === 'T-REC24');
    const future = a.start > s.clock;
    drawerBody.innerHTML = `
      <dl>
        <dt>Paciente</dt><dd><a href="/app/pacientes/ficha/?id=${p?.id ?? ''}">${esc(p?.name ?? '')}</a></dd>
        <dt>Cuándo</dt><dd>${esc(dayLabel(dayOf(a.start)))} · ${hhmm(a.start)}</dd>
        <dt>Profesional</dt><dd>${esc(pro?.name ?? '')}<br><span class="muted small">${esc(pro ? SPECIALTY_BY_ID[pro.specialty].name : '')} · ${esc(pro?.room ?? '')}</span></dd>
        <dt>Estado</dt><dd>${apptStatus(a.status)}</dd>
        <dt>Recordatorio</dt><dd>${a.remindedAt !== undefined ? `Enviado ${esc(relativeStamp(a.remindedAt, s.clock))}` : future ? 'Sale solo 24 h antes' : '—'}</dd>
      </dl>
      <div class="actions">
        ${future && a.status !== 'confirmado' && a.status !== 'cancelado' ? `<button class="btn btn-sm btn-primary" type="button" data-do="confirmar">${icon('check')}Confirmar</button>` : ''}
        ${future && a.status === 'pendiente' ? `<button class="btn btn-sm" type="button" data-do="recordar">${icon('send')}Recordar ahora</button>` : ''}
        ${future && a.status !== 'cancelado' ? `<button class="btn btn-sm" type="button" data-do="reprogramar">${icon('calendar')}Reprogramar</button>` : ''}
        ${future && a.status !== 'cancelado' ? `<button class="btn btn-sm btn-danger" type="button" data-do="cancelar">Cancelar turno</button>` : ''}
        ${!future && a.status !== 'atendido' && a.status !== 'cancelado' ? `<button class="btn btn-sm" type="button" data-do="atendido">${icon('check')}Marcar atendido</button>` : ''}
      </div>
      ${tpl && p ? `<p class="small muted" style="margin-top:20px">Así le llega el recordatorio:</p><p class="bubble-preview">${esc(fillTemplate(tpl.body, varsFor(p, a)))}</p>` : ''}`;
  };

  const openDrawer = (id: string) => {
    openId = id;
    setQuery('turno', id);
    drawerBody.dataset.sig = '';
    renderDrawer(getState());
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    $('.overlay')?.classList.add('open');
    $<HTMLElement>('[data-close-drawer]', drawer)?.focus();
  };
  const closeDrawer = () => {
    if (!openId) return;
    const prev = openId;
    openId = null;
    setQuery('turno', null);
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    $('.overlay')?.classList.remove('open');
    root.querySelector<HTMLElement>(`[data-appt="${prev}"]`)?.focus();
  };

  const act = (what: string) => {
    const id = openId;
    if (!id) return;
    let message = '';
    mutate((s) => {
      const a = s.appointments.find((x) => x.id === id);
      if (!a) return [];
      const p = patientById(s, a.patientId);
      const events: SimEvent[] = [];
      if (what === 'confirmar') {
        a.status = 'confirmado';
        a.replyAt = undefined;
        message = 'Turno confirmado por recepción.';
        events.push(addActivity(s, 'confirmacion', `Recepción confirmó el turno de ${p?.name ?? 'paciente'} (${hhmm(a.start)}).`, `/app/agenda/?turno=${a.id}`));
      } else if (what === 'cancelar') {
        a.status = 'cancelado';
        a.replyAt = undefined;
        message = 'Turno cancelado. El horario quedó libre.';
        const flow = flowFor(s, 'turno-cancelado');
        if (flow) events.push(runFlow(s, flow, () => 'no', `Lista de espera para las ${hhmm(a.start)}`));
        events.push(addActivity(s, 'cancelacion', `Recepción canceló el turno de ${p?.name ?? 'paciente'} (${hhmm(a.start)}).`, `/app/agenda/?turno=${a.id}`));
      } else if (what === 'atendido') {
        a.status = 'atendido';
        message = 'Turno marcado como atendido.';
      } else if (what === 'recordar') {
        const flow = flowFor(s, 'turno-proximo');
        const conv = conversationFor(s, a.patientId, 'Recordatorio de turno', PRO_BY_ID[a.proId]?.specialty ?? null);
        const tpl = flowTemplate(s, flow, 'T-REC24');
        const e = tpl ? sendTemplate(s, conv, tpl.id, p, a) : null;
        if (e) events.push(e);
        a.status = 'recordado';
        a.remindedAt = s.clock;
        a.replyAt = s.clock + 2 + (s.seq % 6);
        if (flow) events.push(runFlow(s, flow, () => 'si', `Recordatorio a ${p?.name ?? 'paciente'}`));
        message = 'Recordatorio enviado. La respuesta llega en minutos.';
      } else if (what === 'reprogramar') {
        const slot = findFreeSlot(s, a.proId, dayOf(a.start) + 1);
        if (slot === null) {
          message = 'No hay horarios libres esta semana.';
          return [];
        }
        a.status = 'reprogramado';
        const fresh: Appointment = { id: nextId(s, 'A'), patientId: a.patientId, proId: a.proId, start: slot, duration: a.duration, status: 'confirmado', remindedAt: s.clock };
        s.appointments.push(fresh);
        const conv = conversationFor(s, a.patientId, 'Reprogramación', PRO_BY_ID[a.proId]?.specialty ?? null);
        const e = sendTemplate(s, conv, 'T-REPRO', p, fresh);
        if (e) events.push(e);
        message = `Nuevo turno: ${relativeStamp(slot, s.clock)}.`;
        events.push(addActivity(s, 'reprogramacion', `Recepción reprogramó a ${p?.name ?? 'paciente'} para ${relativeStamp(slot, s.clock)}.`, `/app/agenda/?turno=${fresh.id}`));
      }
      events.push({ type: 'appointment', apptId: a.id, status: a.status });
      return events;
    });
    if (message) toast(message);
  };

  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    const appt = t.closest<HTMLElement>('[data-appt]');
    if (appt?.dataset.appt) {
      openDrawer(appt.dataset.appt);
      return;
    }
    const d = t.closest<HTMLElement>('[data-day]');
    if (d) {
      day = Number(d.dataset.day);
      setQuery('dia', String(day));
      builtFor = '';
      render(getState());
      $<HTMLElement>(`[data-day="${day}"]`, daysEl)?.focus();
      return;
    }
    const st = t.closest<HTMLElement>('[data-status]');
    if (st) {
      const v = st.dataset.status as AppointmentStatus;
      statusFilter = statusFilter === v ? null : v;
      builtFor = '';
      summary.dataset.sig = '';
      render(getState());
      return;
    }
    const m = t.closest<HTMLElement>('[data-mode]');
    if (m) {
      mode = m.dataset.mode as typeof mode;
      for (const b of $$('[data-mode]', root)) b.setAttribute('aria-pressed', String(b === m));
      builtFor = '';
      listEl.dataset.sig = '';
      render(getState());
      return;
    }
    const doIt = t.closest<HTMLElement>('[data-do]');
    if (doIt?.dataset.do) {
      act(doIt.dataset.do);
      return;
    }
    if (t.closest('[data-close-drawer]')) closeDrawer();
  };
  const onDaysKey = (ev: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const days = weekDays(getState());
    const i = days.indexOf(day) + (ev.key === 'ArrowRight' ? 1 : -1);
    const next = days[Math.max(0, Math.min(days.length - 1, i))];
    if (next === undefined) return;
    ev.preventDefault();
    day = next;
    builtFor = '';
    render(getState());
    $<HTMLElement>(`[data-day="${day}"]`, daysEl)?.focus();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') closeDrawer();
  };
  const onOverlay = (ev: Event) => {
    if ((ev.target as Element).closest('[data-overlay]')) closeDrawer();
  };
  const onSpec = () => {
    builtFor = '';
    summary.dataset.sig = '';
    render(getState());
  };
  const onMedia = () => {
    mode = mobile.matches ? 'list' : 'timeline';
    for (const b of $$('[data-mode]', root)) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    builtFor = '';
    listEl.dataset.sig = '';
    render(getState());
  };

  root.addEventListener('click', onClick);
  daysEl.addEventListener('keydown', onDaysKey);
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onOverlay);
  spec.addEventListener('change', onSpec);
  mobile.addEventListener('change', onMedia);
  render(getState());
  if (openId) openDrawer(openId);
  const unsub = subscribe(render);
  const unEvent = onEvent((e) => {
    if (e.type === 'reset') {
      builtFor = '';
      daysEl.dataset.sig = '';
      day = dayOf(getState().clock);
    }
  });
  return () => {
    unsub();
    unEvent();
    closeDrawer();
    root.removeEventListener('click', onClick);
    daysEl.removeEventListener('keydown', onDaysKey);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onOverlay);
    spec.removeEventListener('change', onSpec);
    mobile.removeEventListener('change', onMedia);
  };
}
