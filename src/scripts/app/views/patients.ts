// Pacientes: searchable, filterable CRM list, plus "Nuevo paciente".
import { navigate } from 'astro:transitions/client';
import { normalize } from '../../../lib/classify';
import { nextId } from '../../../lib/ops';
import { getState, mutate, subscribe } from '../../../lib/store';
import { ago, relativeStamp } from '../../../lib/time';
import type { AppState, Patient, SpecialtyId } from '../../../lib/types';
import { $, avatar, esc, hueFor, keyed, specTag } from '../dom';
import { toast } from '../toasts';

const PAGE = 30;

export function mount(root: HTMLElement): () => void {
  const rows = $('[data-rows]', root)!;
  const search = $<HTMLInputElement>('[data-search]', root)!;
  const spec = $<HTMLSelectElement>('[data-spec]', root)!;
  const tag = $<HTMLSelectElement>('[data-tag]', root)!;
  const sort = $<HTMLSelectElement>('[data-sort]', root)!;
  const count = $('[data-count]', root)!;
  const more = $<HTMLButtonElement>('[data-more]', root)!;
  const dialog = $<HTMLDialogElement>('#new-patient', root)!;
  let limit = PAGE;
  rows.innerHTML = '';

  const tags = [...new Set(getState().patients.flatMap((p) => p.tags))].sort();
  tag.innerHTML += tags.map((t) => `<option>${esc(t)}</option>`).join('');

  const render = (s: AppState) => {
    const q = normalize(search.value).trim();
    const nextAppt = new Map<string, number>();
    for (const a of s.appointments) {
      if (a.start < s.clock || a.status === 'cancelado' || a.status === 'reprogramado') continue;
      const cur = nextAppt.get(a.patientId);
      if (cur === undefined || a.start < cur) nextAppt.set(a.patientId, a.start);
    }
    let list = s.patients.filter((p) => {
      if (spec.value && p.specialty !== (spec.value as SpecialtyId)) return false;
      if (tag.value && !p.tags.includes(tag.value)) return false;
      if (q && !normalize(`${p.name} ${p.phone} ${p.id}`).includes(q)) return false;
      return true;
    });
    if (sort.value === 'nombre') list = list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    else if (sort.value === 'turno') list = list.sort((a, b) => (nextAppt.get(a.id) ?? Infinity) - (nextAppt.get(b.id) ?? Infinity));
    else list = list.sort((a, b) => b.lastContactAt - a.lastContactAt);
    count.textContent = `${list.length} pacientes`;
    more.hidden = list.length <= limit;
    keyed(
      rows,
      list.slice(0, limit),
      (p) => p.id,
      (p) => row(p, nextAppt.get(p.id), s.clock),
      (p) => `${p.lastContactAt}|${nextAppt.get(p.id)}|${p.tags.join(',')}|${p.name}`,
      (el) => el.classList.add('flash'),
    );
  };

  const row = (p: Patient, next: number | undefined, now: number) => `<tr>
    <td class="who-cell"><div class="who">${avatar(p.name, hueFor(p.name))}<div><a class="row-link" href="/app/pacientes/ficha/?id=${p.id}">${esc(p.name)}</a><small>${esc(p.phone)}</small></div></div></td>
    <td>${specTag(p.specialty)}</td>
    <td data-label="Cobertura">${esc(p.insurance)}</td>
    <td data-label="Próximo turno">${next !== undefined ? esc(relativeStamp(next, now)) : '<span class="muted">Sin turno</span>'}</td>
    <td data-label="Último contacto">${p.lastContactAt > -10 * 24 * 60 ? esc(ago(p.lastContactAt, now)) : `hace ${Math.round((now - p.lastContactAt) / 1440)} días`}</td>
    <td class="${p.tags.length ? '' : 'hide-sm'}"><div class="tags-cell">${p.tags.map((t) => `<span class="tag" style="--h:${hueFor(t)}">${esc(t)}</span>`).join('')}</div></td>
  </tr>`;

  const rerender = () => {
    limit = PAGE;
    render(getState());
  };
  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    if (t.closest('[data-more]')) {
      limit += PAGE;
      render(getState());
    }
    if (t.closest('[data-action="new-patient"]')) {
      dialog.showModal();
      $<HTMLInputElement>('#np-name', dialog)?.focus();
    }
  };
  const onSubmit = (ev: Event) => {
    const form = ev.target as HTMLFormElement;
    if (!form.matches('[data-new-form]')) return;
    ev.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    let id = '';
    mutate((s) => {
      id = nextId(s, 'P');
      s.patients.push({
        id, name, phone: String(data.get('phone') ?? ''), age: 30, insurance: String(data.get('insurance') ?? 'Particular'),
        specialty: String(data.get('specialty') ?? 'clinica') as SpecialtyId, tags: ['Nuevo contacto'], notes: '', createdAt: s.clock, lastContactAt: s.clock,
      });
    });
    dialog.close();
    form.reset();
    toast('Ficha creada', `${name} ya está en la base de pacientes.`);
    void navigate(`/app/pacientes/ficha/?id=${id}`);
  };
  search.addEventListener('input', rerender);
  for (const el of [spec, tag, sort]) el.addEventListener('change', rerender);
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  render(getState());
  const unsub = subscribe(render);
  return () => {
    unsub();
    search.removeEventListener('input', rerender);
    for (const el of [spec, tag, sort]) el.removeEventListener('change', rerender);
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
  };
}
