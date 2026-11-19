// Ficha de paciente: data, tags, notes, appointments (book / cancel / confirm) and message timeline.
import { navigate } from 'astro:transitions/client';
import { PROFESSIONALS, PRO_BY_ID, SPECIALTY_BY_ID } from '../../../data/catalog';
import { icon } from '../../../lib/icons';
import { addActivity, conversationFor, findFreeSlot, makeMessage, nextId, patientById, pushMessage } from '../../../lib/ops';
import { getState, mutate, onEvent, subscribe } from '../../../lib/store';
import { dayOf, relativeStamp } from '../../../lib/time';
import type { AppState, Appointment, Patient } from '../../../lib/types';
import { $, avatar, esc, hueFor, query, specTag } from '../dom';
import { toast } from '../toasts';
import { apptStatus } from './shared';

export function mount(root: HTMLElement): () => void {
  const id = query('id') ?? '';
  const head = $('[data-head] .ficha-id', root)!;
  const appts = $('[data-appts]', root)!;
  const timeline = $('[data-timeline]', root)!;
  const data = $('[data-data]', root)!;
  const tags = $('[data-tags]', root)!;
  const notes = $<HTMLTextAreaElement>('[data-notes]', root)!;
  const saved = $('[data-saved]', root)!;
  const crumb = $('[data-crumb]', root)!;
  const bookDialog = $<HTMLDialogElement>('#book', root)!;
  const msgDialog = $<HTMLDialogElement>('#message', root)!;
  let sigs = { head: '-', appts: '-', tl: '-', tags: '-' };

  const patient = (s: AppState): Patient | undefined => patientById(s, id);

  const render = (s: AppState) => {
    const p = patient(s);
    if (!p) {
      head.innerHTML = `<div><h1>Paciente no encontrado</h1><p>Puede que la demo se haya reiniciado. <a href="/app/pacientes/">Volver a pacientes</a></p></div>`;
      appts.innerHTML = '';
      timeline.innerHTML = '';
      return;
    }
    const headSig = `${p.name}|${p.phone}`;
    if (sigs.head !== headSig) {
      sigs.head = headSig;
      document.title = `${p.name} · Recepta (demo)`;
      crumb.textContent = p.name;
      head.innerHTML = `${avatar(p.name, hueFor(p.name))}<div><h1>${esc(p.name)}</h1><p>${esc(p.phone)} · ${esc(p.insurance)} · ${p.age} años</p></div>`;
      data.innerHTML = `
        <dt>Código</dt><dd>${esc(p.id)}</dd>
        <dt>Especialidad</dt><dd>${specTag(p.specialty)}</dd>
        <dt>Alta</dt><dd>${p.createdAt < -1440 ? `hace ${Math.round((s.clock - p.createdAt) / 1440)} días` : esc(relativeStamp(p.createdAt, s.clock))}</dd>
        <dt>Canal</dt><dd>Mensajería (simulada)</dd>`;
      if (document.activeElement !== notes) notes.value = p.notes;
    }

    // Appointments
    const mine = s.appointments.filter((a) => a.patientId === p.id).sort((a, b) => a.start - b.start);
    const upcoming = mine.filter((a) => a.start >= s.clock && a.status !== 'cancelado' && a.status !== 'reprogramado');
    const past = mine.filter((a) => !upcoming.includes(a)).reverse();
    const apptSig = mine.map((a) => `${a.id}:${a.status}`).join(',');
    if (sigs.appts !== apptSig) {
      const first = sigs.appts !== '-';
      sigs.appts = apptSig;
      const item = (a: Appointment, actions: boolean) => {
        const pro = PRO_BY_ID[a.proId];
        return `<li data-appt="${a.id}" class="${first ? 'flash' : ''}"><span><span class="when">${esc(relativeStamp(a.start, s.clock))}</span><br><span class="muted">${esc(pro?.name ?? '')} · ${esc(pro ? SPECIALTY_BY_ID[pro.specialty].name : '')}</span></span>${apptStatus(a.status)}
          ${actions ? `<span class="actions">${a.status !== 'confirmado' ? `<button class="btn btn-sm" type="button" data-confirm="${a.id}">${icon('check')}Confirmar</button>` : ''}<button class="btn btn-sm btn-ghost" type="button" data-cancel="${a.id}">Cancelar</button></span>` : ''}</li>`;
      };
      appts.innerHTML =
        `<h3 class="appt-group">Próximos</h3><ul class="appt-list">` +
        (upcoming.length ? upcoming.slice(0, 4).map((a) => item(a, true)).join('') : '<li><span class="muted">Sin turnos próximos.</span></li>') +
        (upcoming.length > 4 ? `<li><span class="muted small">Y ${upcoming.length - 4} turnos más esta semana.</span></li>` : '') +
        '</ul>' +
        (past.length ? `<h3 class="appt-group">Historial de la semana</h3><ul class="appt-list">${past.slice(0, 4).map((a) => item(a, false)).join('')}</ul>` : '');
    }

    // Timeline: every message across this patient's conversations.
    const msgs = s.conversations.filter((c) => c.patientId === p.id).flatMap((c) => c.messages.map((m) => ({ m, c }))).sort((a, b) => b.m.at - a.m.at);
    const tlSig = msgs.map(({ m }) => m.id).join(',');
    if (sigs.tl !== tlSig) {
      sigs.tl = tlSig;
      timeline.innerHTML = msgs.length
        ? msgs
            .slice(0, 8)
            .map(
              ({ m, c }) => `<li class="from-${m.from}"><span class="who">${m.from === 'bot' ? 'Automático' : m.from === 'recepcion' ? 'Recepción' : 'Paciente'} · ${esc(relativeStamp(m.at, s.clock))} · <a href="/app/bandeja/?c=${c.id}">ver chat</a></span><br>${esc(m.text)}</li>`,
            )
            .join('')
        : '<li class="muted">Todavía no hay mensajes con este paciente.</li>';
    }

    const tagSig = p.tags.join('|');
    if (sigs.tags !== tagSig) {
      sigs.tags = tagSig;
      tags.innerHTML = p.tags.length
        ? p.tags.map((t) => `<span class="tag" style="--h:${hueFor(t)}">${esc(t)}<button class="tag-remove" type="button" data-untag="${esc(t)}" aria-label="Quitar etiqueta ${esc(t)}">×</button></span>`).join('')
        : '<span class="muted small">Sin etiquetas.</span>';
    }
  };

  const openBook = () => {
    const s = getState();
    const p = patient(s);
    if (!p) return;
    const proSel = $<HTMLSelectElement>('[data-book-pro]', bookDialog)!;
    const pros = [...PROFESSIONALS].sort((a, b) => Number(b.specialty === p.specialty) - Number(a.specialty === p.specialty));
    proSel.innerHTML = pros.map((x) => `<option value="${x.id}">${esc(x.name)} · ${esc(SPECIALTY_BY_ID[x.specialty].short)}</option>`).join('');
    fillSlots();
    bookDialog.showModal();
  };
  const fillSlots = () => {
    const s = getState();
    const proSel = $<HTMLSelectElement>('[data-book-pro]', bookDialog)!;
    const slotSel = $<HTMLSelectElement>('[data-book-slot]', bookDialog)!;
    const options: number[] = [];
    let from = dayOf(s.clock);
    for (let i = 0; i < 4; i++) {
      const slot = findFreeSlot({ ...s, appointments: [...s.appointments, ...options.map((o) => ({ proId: proSel.value, start: o, status: 'confirmado' }) as Appointment)] }, proSel.value, from);
      if (slot === null) break;
      options.push(slot);
      from = dayOf(slot);
    }
    slotSel.innerHTML = options.map((o) => `<option value="${o}">${esc(relativeStamp(o, s.clock))}</option>`).join('') || '<option value="">Sin horarios libres</option>';
  };

  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    if (t.closest('[data-action="book"]')) openBook();
    if (t.closest('[data-action="message"]')) {
      msgDialog.showModal();
      $<HTMLTextAreaElement>('#msg-text', msgDialog)?.focus();
    }
    const untag = t.closest<HTMLElement>('[data-untag]')?.dataset.untag;
    if (untag) mutate((s) => {
      const p = patient(s);
      if (p) p.tags = p.tags.filter((x) => x !== untag);
    });
    const cancel = t.closest<HTMLElement>('[data-cancel]')?.dataset.cancel;
    const confirm = t.closest<HTMLElement>('[data-confirm]')?.dataset.confirm;
    if (cancel || confirm) {
      mutate((s) => {
        const a = s.appointments.find((x) => x.id === (cancel ?? confirm));
        if (!a) return [];
        a.status = cancel ? 'cancelado' : 'confirmado';
        a.replyAt = undefined;
        const p = patient(s);
        return [
          { type: 'appointment', apptId: a.id, status: a.status },
          addActivity(s, cancel ? 'cancelacion' : 'confirmacion', `Recepción ${cancel ? 'canceló' : 'confirmó'} el turno de ${p?.name ?? 'paciente'}.`, `/app/pacientes/ficha/?id=${id}`),
        ];
      });
      toast(cancel ? 'Turno cancelado' : 'Turno confirmado', cancel ? 'Si la lista de espera está activa, Recepta ofrece el horario.' : 'El paciente recibe la confirmación.');
    }
  };
  const onSubmit = (ev: Event) => {
    const form = ev.target as HTMLFormElement;
    if (form.matches('[data-tag-form]')) {
      ev.preventDefault();
      const input = $<HTMLInputElement>('#new-tag', form)!;
      const value = input.value.trim();
      if (!value) return;
      input.value = '';
      mutate((s) => {
        const p = patient(s);
        if (p && !p.tags.includes(value)) p.tags.push(value);
      });
    }
    if (form.matches('[data-book-form]')) {
      ev.preventDefault();
      const fd = new FormData(form);
      const slot = Number(fd.get('slot'));
      const pro = String(fd.get('pro'));
      if (!slot) return;
      mutate((s) => {
        const a: Appointment = { id: nextId(s, 'A'), patientId: id, proId: pro, start: slot, duration: 30, status: 'pendiente', plan: 'confirma' };
        s.appointments.push(a);
        const p = patient(s);
        return [{ type: 'appointment', apptId: a.id, status: a.status }, addActivity(s, 'sistema', `Recepción dio turno a ${p?.name ?? 'paciente'} con ${PRO_BY_ID[pro]?.name ?? ''}.`, `/app/pacientes/ficha/?id=${id}`)];
      });
      bookDialog.close();
      toast('Turno reservado', `${relativeStamp(slot, getState().clock)} con ${PRO_BY_ID[pro]?.name ?? ''}. El recordatorio sale solo.`);
    }
    if (form.matches('[data-msg-form]')) {
      ev.preventDefault();
      const text = ($<HTMLTextAreaElement>('#msg-text', form)?.value ?? '').trim();
      if (!text) return;
      let convId = '';
      mutate((s) => {
        const p = patient(s);
        if (!p) return [];
        const c = conversationFor(s, p.id, 'Mensaje de recepción', p.specialty);
        convId = c.id;
        c.status = 'resuelta';
        c.replyAt = s.clock + 3;
        return [pushMessage(s, c, makeMessage(s, 'recepcion', text))];
      });
      msgDialog.close();
      form.reset();
      toast('Mensaje enviado', 'Lo podés seguir desde la bandeja.', `/app/bandeja/?c=${convId}`);
    }
  };
  const onChange = (ev: Event) => {
    if ((ev.target as Element).matches('[data-book-pro]')) fillSlots();
  };
  let noteTimer: number | undefined;
  const onNotes = () => {
    window.clearTimeout(noteTimer);
    saved.textContent = 'Guardando…';
    noteTimer = window.setTimeout(() => {
      mutate((s) => {
        const p = patient(s);
        if (p) p.notes = notes.value;
      });
      saved.textContent = 'Nota guardada.';
    }, 500);
  };

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  notes.addEventListener('input', onNotes);
  render(getState());
  const unsub = subscribe(render);
  const unEvent = onEvent((e) => {
    if (e.type === 'reset') {
      sigs = { head: '-', appts: '-', tl: '-', tags: '-' };
      if (!patient(getState())) void navigate('/app/pacientes/');
    }
  });
  return () => {
    unsub();
    unEvent();
    window.clearTimeout(noteTimer);
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('change', onChange);
    notes.removeEventListener('input', onNotes);
  };
}
