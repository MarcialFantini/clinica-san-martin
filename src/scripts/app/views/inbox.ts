// Bandeja: conversation list with filters, live chat, patient panel, composer and "Simular paciente".
import { PROFESSIONALS, PRO_BY_ID, SPECIALTY_BY_ID } from '../../../data/catalog';
import { classify } from '../../../lib/classify';
import { icon } from '../../../lib/icons';
import { makeMessage, nextId, patientById, processInquiry, pushMessage, receiveInquiry } from '../../../lib/ops';
import { getState, mutate, onEvent, subscribe } from '../../../lib/store';
import { ago, relativeStamp } from '../../../lib/time';
import type { AppState, Conversation, Message, Patient, SpecialtyId } from '../../../lib/types';
import { normalize } from '../../../lib/classify';
import { $, $$, avatar, esc, hueFor, keyed, proName, query, reducedMotion, setQuery, specTag } from '../dom';
import { toast } from '../toasts';
import { apptStatus, convStatus } from './shared';

type Filter = 'todas' | 'sinleer' | 'atencion' | 'resuelta';

const FROM_LABEL: Record<Message['from'], string> = { paciente: 'Paciente', bot: 'Automático', recepcion: 'Recepción' };

export function mount(root: HTMLElement): () => void {
  const list = $('[data-list]', root)!;
  const chat = $('[data-chat]', root)!;
  const side = $('[data-side]', root)!;
  const inbox = $('[data-inbox]', root)!;
  const search = $<HTMLInputElement>('[data-search]', root)!;
  const specSel = $<HTMLSelectElement>('[data-spec]', root)!;
  const countLabel = $('[data-count-label]', root)!;
  list.innerHTML = '';

  let filter: Filter = (query('filtro') as Filter | null) ?? 'todas';
  let selected: string | null = query('c');
  let renderedChat: string | null = null;
  const notes = new Map<string, string>();

  for (const b of $$<HTMLButtonElement>('[data-filter]', root)) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));

  const visible = (s: AppState): Conversation[] => {
    const q = normalize(search.value).trim();
    const spec = specSel.value as SpecialtyId | '';
    return s.conversations.filter((c) => {
      if (filter === 'sinleer' && !(c.unread > 0)) return false;
      if (filter === 'atencion' && c.status !== 'atencion') return false;
      if (filter === 'resuelta' && c.status !== 'resuelta') return false;
      if (spec && c.specialty !== spec) return false;
      if (q) {
        const p = patientById(s, c.patientId);
        const hay = normalize(`${p?.name ?? ''} ${c.messages.map((m) => m.text).join(' ')}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  const renderList = (s: AppState) => {
    const items = visible(s);
    countLabel.textContent = `${items.length} conversaciones`;
    keyed(
      list,
      items.slice(0, 80),
      (c) => c.id,
      (c) => {
        const p = patientById(s, c.patientId);
        const last = c.messages[c.messages.length - 1];
        const who = last?.from === 'paciente' ? '' : `${FROM_LABEL[last?.from ?? 'bot']}: `;
        return `<li><a class="conv-item ${c.unread ? 'unread' : ''}" href="?c=${c.id}" data-conv="${c.id}" aria-current="${c.id === selected}">
          ${avatar(p?.name ?? '?', hueFor(p?.name ?? ''))}
          <span class="conv-name ellipsis">${esc(p?.name ?? 'Paciente')}${c.unread ? '<span class="sr-only"> (sin leer)</span>' : ''}</span>
          <time class="conv-time" data-at="${c.updatedAt}">${esc(ago(c.updatedAt, s.clock))}</time>
          <span class="conv-snippet ellipsis">${esc(who + (last?.text ?? ''))}</span>
          <span class="conv-meta">${specTag(c.specialty)} ${convStatus(c.status)}</span>
        </a></li>`;
      },
      (c) => `${c.updatedAt}|${c.status}|${c.unread}|${c.specialty}|${c.id === selected}|${c.messages.length}`,
      (el) => el.classList.add('enter'),
    );
    for (const t of list.querySelectorAll<HTMLElement>('time[data-at]')) t.textContent = ago(Number(t.dataset.at), s.clock);
  };

  const messageHtml = (m: Message, now: number) => {
    const quick = m.quickReplies?.length ? `<div class="quick" aria-label="Respuestas rápidas">${m.quickReplies.map((q) => `<span>${esc(q)}</span>`).join('')}</div>` : '';
    const who = m.from === 'bot' ? `${icon('bolt')} Automático` : m.from === 'recepcion' ? 'Recepción' : '';
    return `<li class="msg from-${m.from}"><div class="bubble">${esc(m.text)}</div>${quick}<div class="msg-meta">${who ? `<span>${who}</span>·` : ''}<time>${esc(relativeStamp(m.at, now))}</time></div></li>`;
  };

  const renderChat = (s: AppState) => {
    const conv = s.conversations.find((c) => c.id === selected);
    inbox.classList.toggle('has-chat', !!conv);
    if (!conv) {
      if (renderedChat !== null) {
        chat.innerHTML = `<div class="empty chat-empty">${icon('inbox', 'icon big-icon')}<p>Elegí una conversación para verla.</p></div>`;
        side.innerHTML = '';
        renderedChat = null;
      }
      return;
    }
    const p = patientById(s, conv.patientId);
    if (renderedChat !== conv.id) {
      renderedChat = conv.id;
      chat.innerHTML = `
        <div class="chat-head">
          <a class="btn btn-sm btn-ghost btn-icon chat-back" href="/app/bandeja/" data-back aria-label="Volver a la lista">${icon('back')}</a>
          ${avatar(p?.name ?? '?', hueFor(p?.name ?? ''))}
          <div class="grow">
            <h2 class="ellipsis">${esc(p?.name ?? 'Paciente')}</h2>
            <div class="conv-meta" data-chat-meta></div>
          </div>
          <div class="chat-actions">
            <label class="sr-only" for="assign">Asignar a</label>
            <select class="select" id="assign" data-assign></select>
            <button class="btn btn-sm" type="button" data-resolve>${icon('check')}<span data-resolve-label>Resolver</span></button>
          </div>
        </div>
        <ul class="messages" data-messages aria-live="polite" aria-label="Mensajes"></ul>
        <form class="composer" data-composer>
          <label class="sr-only" for="reply">Responder como recepción</label>
          <select class="select" data-template aria-label="Insertar plantilla">
            <option value="">Plantillas</option>
            ${s.templates.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
          <textarea class="textarea" id="reply" rows="1" placeholder="Responder como recepción" data-reply></textarea>
          <button class="btn btn-primary btn-icon" type="submit" aria-label="Enviar">${icon('send')}</button>
        </form>`;
      const draft = notes.get(conv.id);
      if (draft) $<HTMLTextAreaElement>('[data-reply]', chat)!.value = draft;
    }
    // Header meta and assignment
    const meta = $('[data-chat-meta]', chat);
    if (meta) meta.innerHTML = `${specTag(conv.specialty)} ${convStatus(conv.status)} ${conv.proId ? `<span class="small muted">${esc(proName(conv.proId))}</span>` : ''}`;
    const assign = $<HTMLSelectElement>('[data-assign]', chat);
    if (assign && document.activeElement !== assign) {
      const pros = conv.specialty ? PROFESSIONALS.filter((x) => x.specialty === conv.specialty) : PROFESSIONALS;
      const opts = `<option value="">Sin asignar</option>${pros.map((x) => `<option value="${x.id}" ${x.id === conv.proId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
      if (assign.dataset.sig !== `${conv.specialty}|${conv.proId}`) {
        assign.innerHTML = opts;
        assign.dataset.sig = `${conv.specialty}|${conv.proId}`;
      }
    }
    const resolveLabel = $('[data-resolve-label]', chat);
    if (resolveLabel) resolveLabel.textContent = conv.status === 'resuelta' ? 'Reabrir' : 'Resolver';

    // Messages
    const msgs = $('[data-messages]', chat)!;
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    const items: Array<{ key: string; html: string; sig: string }> = conv.messages.map((m) => ({ key: m.id, html: messageHtml(m, s.clock), sig: m.id }));
    const note = notes.get(`sys-${conv.id}`);
    if (note) {
      const firstBot = conv.messages.findIndex((m) => m.from === 'bot');
      items.splice(firstBot >= 0 ? firstBot : items.length, 0, { key: `sys-${conv.id}`, html: note, sig: 'sys' });
    }
    if (conv.replyAt !== undefined || conv.autoAt !== undefined) items.push({ key: 'typing', html: '<li class="typing" aria-label="Escribiendo"><i></i><i></i><i></i></li>', sig: 'typing' });
    const before = msgs.children.length;
    keyed(msgs, items, (i) => i.key, (i) => i.html, (i) => i.sig, (el) => el.classList.add('pop'));
    if (nearBottom || before === 0) msgs.scrollTop = msgs.scrollHeight;

    // Side panel
    const next = s.appointments.filter((a) => a.patientId === conv.patientId && a.start >= s.clock).sort((a, b) => a.start - b.start)[0];
    const sideSig = `${conv.patientId}|${next?.id}|${next?.status}|${p?.tags.join(',')}`;
    if (side.dataset.sig !== sideSig && p) {
      side.dataset.sig = sideSig;
      side.innerHTML = `
        ${avatar(p.name, hueFor(p.name))}
        <h2>${esc(p.name)}</h2>
        <ul class="side-list">
          <li><span>Teléfono</span>${esc(p.phone)}</li>
          <li><span>Cobertura</span>${esc(p.insurance)}</li>
          <li><span>Edad</span>${p.age} años</li>
          <li><span>Próximo turno</span>${next ? `${esc(relativeStamp(next.start, s.clock))} · ${esc(PRO_BY_ID[next.proId]?.name ?? '')}<br>${apptStatus(next.status)}` : 'Sin turnos próximos'}</li>
        </ul>
        <div class="side-tags">${p.tags.map((t) => `<span class="tag" style="--h:${hueFor(t)}">${esc(t)}</span>`).join('')}</div>
        <p style="margin-top:16px"><a class="btn btn-sm" href="/app/pacientes/ficha/?id=${p.id}">Ver ficha completa</a></p>`;
    }
  };

  const render = (s: AppState) => {
    renderList(s);
    renderChat(s);
  };

  const select = (id: string | null) => {
    selected = id;
    setQuery('c', id);
    if (id) {
      mutate((s) => {
        const c = s.conversations.find((x) => x.id === id);
        if (c) c.unread = 0;
      });
    } else render(getState());
  };

  // Simulate patient
  const dialog = $<HTMLDialogElement>('#simulate', root)!;
  const simText = $<HTMLTextAreaElement>('#sim-text', root)!;
  const simPreview = $('[data-sim-preview]', root)!;
  const updatePreview = () => {
    const r = classify(simText.value);
    simPreview.textContent = simText.value.trim()
      ? r.specialty
        ? `Recepta lo clasificaría como ${SPECIALTY_BY_ID[r.specialty].name} (confianza ${Math.round(r.confidence * 100)} %).`
        : 'Recepta no reconoce una especialidad: lo derivaría a recepción.'
      : '';
  };
  simText.addEventListener('input', updatePreview);

  const simulate = (name: string, text: string) => {
    let convId = '';
    mutate((s) => {
      const patient: Patient = {
        id: nextId(s, 'P'), name: name.trim() || 'Paciente de prueba', phone: '+54 9 341 555-0000', age: 35, insurance: 'Particular',
        specialty: 'clinica', tags: ['Nuevo contacto', 'Simulado'], notes: 'Paciente creado desde "Simular paciente".', createdAt: s.clock, lastContactAt: s.clock,
      };
      s.patients.push(patient);
      const events = receiveInquiry(s, patient, text);
      const conv = s.conversations[0] as Conversation;
      conv.unread = 0;
      // Keep the engine away: this view runs the automation itself so it can explain it.
      conv.autoAt = Number.MAX_SAFE_INTEGER;
      convId = conv.id;
      return events;
    });
    filter = 'todas';
    for (const b of $$<HTMLButtonElement>('[data-filter]', root)) b.setAttribute('aria-pressed', String(b.dataset.filter === 'todas'));
    search.value = '';
    specSel.value = '';
    select(convId);
    // The automation answers in about a second, even when the clock is paused.
    window.setTimeout(() => {
      mutate((s) => {
        const conv = s.conversations.find((c) => c.id === convId);
        if (!conv || conv.autoAt === undefined) return [];
        const r = classify(conv.messages[0]?.text ?? '');
        const events = processInquiry(s, conv);
        const tag = specTag(r.specialty);
        notes.set(
          `sys-${conv.id}`,
          `<li class="sys-note">${r.specialty ? `Clasificada como ${tag} por “${esc(r.matched.join(', '))}” · derivada a <b>${esc(proName(conv.proId))}</b>` : `Sin especialidad clara ${tag} · queda para recepción`}</li>`,
        );
        return events;
      });
      const s = getState();
      const conv = s.conversations.find((c) => c.id === convId);
      toast(conv?.specialty ? `Derivada a ${SPECIALTY_BY_ID[conv.specialty].name}` : 'Derivada a recepción', conv?.proId ? `La atiende ${proName(conv.proId)}.` : 'Una persona responde en minutos.');
    }, reducedMotion() ? 200 : 1100);
  };

  // Events
  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    const conv = t.closest<HTMLAnchorElement>('[data-conv]');
    if (conv) {
      ev.preventDefault();
      select(conv.dataset.conv ?? null);
      $<HTMLElement>('[data-messages]', chat)?.focus?.();
      return;
    }
    if (t.closest('[data-back]')) {
      ev.preventDefault();
      select(null);
      return;
    }
    const f = t.closest<HTMLButtonElement>('[data-filter]');
    if (f) {
      filter = f.dataset.filter as Filter;
      setQuery('filtro', filter === 'todas' ? null : filter);
      for (const b of $$<HTMLButtonElement>('[data-filter]', root)) b.setAttribute('aria-pressed', String(b === f));
      renderList(getState());
      return;
    }
    if (t.closest('[data-action="simulate"]')) {
      dialog.showModal();
      simText.focus();
      return;
    }
    const ex = t.closest<HTMLButtonElement>('[data-example]');
    if (ex) {
      simText.value = ex.dataset.example ?? '';
      updatePreview();
      return;
    }
    if (t.closest('[data-resolve]') && selected) {
      mutate((s) => {
        const c = s.conversations.find((x) => x.id === selected);
        if (c) c.status = c.status === 'resuelta' ? 'derivada' : 'resuelta';
      });
    }
  };
  const onChange = (ev: Event) => {
    const t = ev.target as HTMLElement;
    if (t.matches('[data-assign]') && selected) {
      const value = (t as HTMLSelectElement).value;
      mutate((s) => {
        const c = s.conversations.find((x) => x.id === selected);
        if (!c) return;
        c.proId = value || null;
        if (value) {
          c.specialty = PRO_BY_ID[value]?.specialty ?? c.specialty;
          if (c.status === 'atencion' || c.status === 'nueva') c.status = 'derivada';
        }
      });
      toast('Conversación reasignada', value ? `Ahora la atiende ${proName(value)}.` : 'Quedó sin asignar.');
    }
    if (t.matches('[data-template]')) {
      const sel = t as HTMLSelectElement;
      const tpl = getState().templates.find((x) => x.id === sel.value);
      const reply = $<HTMLTextAreaElement>('[data-reply]', chat);
      if (tpl && reply) {
        reply.value = tpl.body;
        reply.focus();
      }
      sel.value = '';
    }
    if (t === specSel) renderList(getState());
  };
  const onSubmit = (ev: Event) => {
    const form = ev.target as HTMLFormElement;
    if (form.matches('[data-composer]')) {
      ev.preventDefault();
      const reply = $<HTMLTextAreaElement>('[data-reply]', form)!;
      const text = reply.value.trim();
      if (!text || !selected) return;
      reply.value = '';
      notes.delete(selected);
      const id = selected;
      mutate((s) => {
        const c = s.conversations.find((x) => x.id === id);
        if (!c) return [];
        const p = patientById(s, c.patientId);
        const filled = text.replace(/\{\{\s*nombre\s*\}\}/g, p?.name.split(' ')[0] ?? '');
        const e = pushMessage(s, c, makeMessage(s, 'recepcion', filled));
        c.status = 'resuelta';
        c.replyAt = s.clock + 2 + (s.seq % 4);
        return [e];
      });
    }
    if (form.matches('[data-sim-form]')) {
      ev.preventDefault();
      const name = ($<HTMLInputElement>('#sim-name', form)?.value ?? '').slice(0, 40);
      const text = simText.value.trim();
      if (!text) return;
      dialog.close();
      simText.value = '';
      simPreview.textContent = '';
      simulate(name, text);
    }
  };
  const onKey = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement;
    if (t.matches('[data-reply]') && ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      (t.closest('form') as HTMLFormElement | null)?.requestSubmit();
    }
  };
  const onInput = (ev: Event) => {
    const t = ev.target as HTMLElement;
    if (t === search) renderList(getState());
    if (t.matches('[data-reply]') && selected) notes.set(selected, (t as HTMLTextAreaElement).value);
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('keydown', onKey);
  root.addEventListener('input', onInput);

  // On wide screens the chat pane is always visible, so open the latest conversation.
  if (!selected && window.matchMedia('(min-width: 721px)').matches) selected = getState().conversations[0]?.id ?? null;
  if (selected) select(selected);
  else render(getState());
  if (query('simular')) {
    setQuery('simular', null);
    dialog.showModal();
    simText.focus();
  }
  const unsub = subscribe(render);
  const unEvent = onEvent((e) => {
    if (e.type === 'message' && e.convId === selected && e.from === 'paciente') {
      mutate((s) => {
        const c = s.conversations.find((x) => x.id === e.convId);
        if (c) c.unread = 0;
      });
    }
  });
  const clockTimer = window.setInterval(() => {
    const now = getState().clock;
    for (const t of list.querySelectorAll<HTMLElement>('time[data-at]')) t.textContent = ago(Number(t.dataset.at), now);
  }, 5000);
  return () => {
    unsub();
    unEvent();
    window.clearInterval(clockTimer);
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('input', onInput);
  };
}
