// Campañas: live progress of each send, funnel, start / pause / resume, and "Nueva campaña".
import { DAY_MIN, SPECIALTY_BY_ID } from '../../../data/catalog';
import { icon } from '../../../lib/icons';
import { addActivity, addNotice, nextId } from '../../../lib/ops';
import { getState, mutate, subscribe } from '../../../lib/store';
import { dayOf, relativeStamp } from '../../../lib/time';
import type { AppState, Campaign, CampaignStatus, SpecialtyId } from '../../../lib/types';
import { $, esc, fmt, keyed, pct, query, setQuery } from '../dom';
import { toast } from '../toasts';

const STATUS: Record<CampaignStatus, string> = { borrador: 'Borrador', programada: 'Programada', enviando: 'Enviando', pausada: 'Pausada', finalizada: 'Finalizada' };

/** The demo base is a sample; audiences are scaled to a realistic clinic size. */
function audienceFor(s: AppState, spec: SpecialtyId | 'todas'): number {
  const n = spec === 'todas' ? s.patients.length : s.patients.filter((p) => p.specialty === spec).length;
  return Math.max(40, Math.round(n * 2.3));
}

export function mount(root: HTMLElement): () => void {
  const list = $('[data-list]', root)!;
  const dialog = $<HTMLDialogElement>('#new-camp', root)!;
  const form = $<HTMLFormElement>('[data-form]', root)!;
  const tplSel = $<HTMLSelectElement>('[data-tpl]', form)!;
  const specSel = $<HTMLSelectElement>('[data-spec]', form)!;
  const audience = $('[data-audience]', form)!;
  list.innerHTML = '';

  const card = (c: Campaign, s: AppState) => {
    const tpl = s.templates.find((t) => t.id === c.templateId);
    const actions: string[] = [];
    if (c.status === 'borrador' || c.status === 'programada') actions.push(`<button class="btn btn-sm btn-primary" type="button" data-do="start" data-id="${c.id}">${icon('play')}Enviar ahora</button>`);
    if (c.status === 'enviando') actions.push(`<button class="btn btn-sm" type="button" data-do="pause" data-id="${c.id}">${icon('pause')}Pausar</button>`);
    if (c.status === 'pausada') actions.push(`<button class="btn btn-sm btn-primary" type="button" data-do="resume" data-id="${c.id}">${icon('play')}Reanudar</button>`);
    if (c.status !== 'enviando') actions.push(`<button class="btn btn-sm btn-ghost" type="button" data-do="delete" data-id="${c.id}">${icon('trash')}<span class="sr-only">Eliminar ${esc(c.name)}</span></button>`);
    return `<li class="card camp ${c.status === 'enviando' ? 'sending' : ''}" data-camp="${c.id}">
      <div>
        <h2>${esc(c.name)}</h2>
        <p class="sub"><span class="status st-${c.status}">${STATUS[c.status]}</span> · <span>${c.specialty === 'todas' ? 'Todas las especialidades' : esc(SPECIALTY_BY_ID[c.specialty].name)}</span> · <span>${esc(tpl?.name ?? 'Plantilla')}</span></p>
        ${c.status === 'programada' && c.startAt !== null ? `<p class="small muted" style="margin-top:4px">Empieza ${esc(relativeStamp(c.startAt, s.clock))}</p>` : ''}
      </div>
      <div>
        <div class="progress" role="progressbar" aria-label="Progreso de envío" aria-valuemin="0" aria-valuemax="${c.audience}" aria-valuenow="${c.sent}"><span data-bar style="transform:scaleX(${c.audience ? c.sent / c.audience : 0})"></span></div>
        <div class="funnel">
          <div><b data-f="sent">${fmt(c.sent)}</b>de ${fmt(c.audience)} enviados</div>
          <div><b data-f="replied">${fmt(c.replied)}</b>respondieron <span data-f="rr">${pct(c.replied, c.sent)}</span></div>
          <div><b data-f="booked">${fmt(c.booked)}</b>turnos reservados</div>
        </div>
      </div>
      <div class="camp-actions">${actions.join('')}</div>
    </li>`;
  };

  const render = (s: AppState) => {
    const sorted = [...s.campaigns].sort((a, b) => order(a.status) - order(b.status) || b.createdAt - a.createdAt);
    keyed(list, sorted, (c) => c.id, (c) => card(c, s), (c) => `${c.status}|${c.name}|${c.templateId}|${c.startAt}`);
    for (const c of s.campaigns) {
      const el = list.querySelector(`[data-camp="${c.id}"]`);
      if (!el) continue;
      const bar = el.querySelector<HTMLElement>('[data-bar]');
      if (bar) bar.style.transform = `scaleX(${c.audience ? c.sent / c.audience : 0})`;
      el.querySelector('[role="progressbar"]')?.setAttribute('aria-valuenow', String(c.sent));
      const set = (k: string, v: string) => {
        const n = el.querySelector(`[data-f="${k}"]`);
        if (n && n.textContent !== v) n.textContent = v;
      };
      set('sent', fmt(c.sent));
      set('replied', fmt(c.replied));
      set('booked', fmt(c.booked));
      set('rr', pct(c.replied, c.sent));
    }
  };
  const order = (st: CampaignStatus) => ['enviando', 'programada', 'pausada', 'borrador', 'finalizada'].indexOf(st);

  const openNew = () => {
    const s = getState();
    const tpls = [...s.templates].sort((a, b) => Number(b.category === 'campana') - Number(a.category === 'campana'));
    tplSel.innerHTML = tpls.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    updateAudience();
    dialog.showModal();
    $<HTMLInputElement>('#nc-name', form)?.focus();
  };
  const updateAudience = () => {
    audience.textContent = `Le llega a ${fmt(audienceFor(getState(), specSel.value as SpecialtyId | 'todas'))} pacientes, a un ritmo de unos 60 por hora.`;
  };

  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    if (t.closest('[data-new]')) return openNew();
    const btn = t.closest<HTMLElement>('[data-do]');
    if (!btn) return;
    const id = btn.dataset.id;
    const what = btn.dataset.do;
    let name = '';
    mutate((s) => {
      const c = s.campaigns.find((x) => x.id === id);
      if (!c) return [];
      name = c.name;
      if (what === 'delete') {
        s.campaigns = s.campaigns.filter((x) => x.id !== id);
        return [];
      }
      c.status = what === 'pause' ? 'pausada' : 'enviando';
      if (what === 'start') c.startAt = s.clock;
      return [{ type: 'campaign', campaignId: c.id }, addActivity(s, 'campana', `Campaña ${c.name}: ${what === 'pause' ? 'pausada' : 'enviando'}.`, '/app/campanas/')];
    });
    toast(what === 'delete' ? 'Campaña eliminada' : what === 'pause' ? 'Campaña pausada' : 'Campaña enviando', name);
  };
  const onSubmit = (ev: Event) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    const spec = String(fd.get('specialty')) as SpecialtyId | 'todas';
    const now = fd.get('when') === 'now';
    mutate((s) => {
      const c: Campaign = {
        id: nextId(s, 'CMP'), name, templateId: String(fd.get('template')), specialty: spec, audience: audienceFor(s, spec), sent: 0, replied: 0, booked: 0,
        status: now ? 'enviando' : 'programada', createdAt: s.clock, startAt: now ? s.clock : (dayOf(s.clock) + 1) * DAY_MIN + 10 * 60,
      };
      s.campaigns.unshift(c);
      return [addActivity(s, 'campana', `Nueva campaña ${name} ${now ? 'empezó a enviarse' : 'programada para mañana'}.`, '/app/campanas/'), addNotice(s, 'Campaña creada', `${name}: ${fmt(c.audience)} pacientes.`, 'info', '/app/campanas/')];
    });
    dialog.close();
    form.reset();
    toast('Campaña creada', now ? 'Ya está enviando. Mirá cómo avanza.' : 'Sale mañana a las 10:00.');
  };

  root.addEventListener('click', onClick);
  form.addEventListener('submit', onSubmit);
  specSel.addEventListener('change', updateAudience);
  render(getState());
  if (query('nueva')) {
    setQuery('nueva', null);
    openNew();
  }
  const unsub = subscribe(render);
  return () => {
    unsub();
    root.removeEventListener('click', onClick);
    form.removeEventListener('submit', onSubmit);
    specSel.removeEventListener('change', updateAudience);
  };
}
