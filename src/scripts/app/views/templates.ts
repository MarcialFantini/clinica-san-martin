// Plantillas: list, editor with variables and quick replies, live preview and live usage stats.
import { addActivity, nextId } from '../../../lib/ops';
import { getState, mutate, subscribe } from '../../../lib/store';
import { fillTemplate, SAMPLE_VARS } from '../../../lib/templating';
import type { AppState, Template, TemplateCategory } from '../../../lib/types';
import { $, esc, fmt, keyed, pct, query, setQuery } from '../dom';
import { toast } from '../toasts';

const CAT_LABEL: Record<TemplateCategory, [string, number]> = {
  recordatorio: ['Recordatorio', 220],
  confirmacion: ['Confirmación', 165],
  respuesta: ['Respuesta', 200],
  encuesta: ['Encuesta', 40],
  campana: ['Campaña', 330],
};

export function mount(root: HTMLElement): () => void {
  const list = $('[data-list]', root)!;
  const form = $<HTMLFormElement>('[data-form]', root)!;
  const preview = $('[data-preview]', root)!;
  const stats = $('[data-stats]', root)!;
  const used = $('[data-used]', root)!;
  const saved = $('[data-saved]', root)!;
  const nameI = $<HTMLInputElement>('#tpl-name', form)!;
  const catI = $<HTMLSelectElement>('#tpl-cat', form)!;
  const bodyI = $<HTMLTextAreaElement>('#tpl-body', form)!;
  const quickI = $<HTMLInputElement>('#tpl-quick', form)!;
  list.innerHTML = '';
  let selected = query('id') ?? getState().templates[0]?.id ?? '';
  let loaded = '';
  let timer: number | undefined;

  const current = (s: AppState = getState()): Template | undefined => s.templates.find((t) => t.id === selected);

  const renderPreview = () => {
    const html = esc(bodyI.value).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => `<mark>${esc(fillTemplate(`{{${k}}}`, SAMPLE_VARS))}</mark>`);
    const quick = quickI.value.split(',').map((q) => q.trim()).filter(Boolean);
    preview.innerHTML = `<p class="bubble">${html || '<span class="muted">Escribí el mensaje…</span>'}</p>${quick.length ? `<div class="quick">${quick.map((q) => `<span>${esc(q)}</span>`).join('')}</div>` : ''}`;
  };

  const load = (t: Template, s: AppState) => {
    loaded = t.id;
    nameI.value = t.name;
    catI.value = t.category;
    bodyI.value = t.body;
    quickI.value = t.quickReplies.join(', ');
    renderPreview();
    const flows = s.flows.filter((f) => f.nodes.some((n) => n.kind === 'message' && n.value === t.id));
    const camps = s.campaigns.filter((c) => c.templateId === t.id);
    used.innerHTML = flows.length || camps.length
      ? `Se usa en ${[...flows.map((f) => `<a href="/app/flujos/editor/?id=${f.id}">${esc(f.name)}</a>`), ...camps.map((c) => `<a href="/app/campanas/">${esc(c.name)}</a>`)].join(', ')}.`
      : 'Todavía no la usa ninguna automatización ni campaña.';
  };

  const render = (s: AppState) => {
    keyed(
      list,
      s.templates,
      (t) => t.id,
      (t) => `<li><button type="button" class="tpl-item" data-tpl="${t.id}" aria-current="${t.id === selected}">
        <b>${esc(t.name)}</b>
        <span class="meta"><span class="tag" style="--h:${CAT_LABEL[t.category][1]}">${CAT_LABEL[t.category][0]}</span><span><b data-sent>${fmt(t.sent)}</b> enviados</span></span>
      </button></li>`,
      (t) => `${t.name}|${t.category}|${t.id === selected}`,
    );
    for (const t of s.templates) {
      const el = list.querySelector(`[data-tpl="${t.id}"] [data-sent]`);
      if (el && el.textContent !== fmt(t.sent)) el.textContent = fmt(t.sent);
    }
    const t = current(s);
    if (t && loaded !== t.id) load(t, s);
    if (t) {
      const sig = `${t.sent}|${t.replied}`;
      if (stats.dataset.sig !== sig) {
        stats.dataset.sig = sig;
        stats.innerHTML = `<div><dt>Enviados</dt><dd>${fmt(t.sent)}</dd></div><div><dt>Con respuesta</dt><dd>${t.quickReplies.length ? pct(t.replied, t.sent) : '—'}</dd></div>`;
      }
    }
  };

  const save = () => {
    const id = selected;
    window.clearTimeout(timer);
    saved.textContent = 'Guardando…';
    timer = window.setTimeout(() => {
      mutate((s) => {
        const t = s.templates.find((x) => x.id === id);
        if (!t) return;
        t.name = nameI.value.trim() || 'Sin nombre';
        t.category = catI.value as TemplateCategory;
        t.body = bodyI.value;
        t.quickReplies = quickI.value.split(',').map((q) => q.trim()).filter(Boolean).slice(0, 3);
        t.updatedAt = s.clock;
      });
      saved.textContent = 'Guardado. Los próximos envíos usan este texto.';
    }, 450);
  };

  const onInput = (ev: Event) => {
    if (!(ev.target as Element).closest('[data-form]')) return;
    renderPreview();
    save();
  };
  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    const item = t.closest<HTMLElement>('[data-tpl]');
    if (item?.dataset.tpl) {
      selected = item.dataset.tpl;
      setQuery('id', selected);
      render(getState());
      return;
    }
    const v = t.closest<HTMLElement>('[data-var]')?.dataset.var;
    if (v) {
      const start = bodyI.selectionStart ?? bodyI.value.length;
      const end = bodyI.selectionEnd ?? start;
      bodyI.setRangeText(`{{${v}}}`, start, end, 'end');
      bodyI.focus();
      renderPreview();
      save();
      return;
    }
    if (t.closest('[data-new]')) {
      mutate((s) => {
        selected = nextId(s, 'T');
        s.templates.unshift({ id: selected, name: 'Nueva plantilla', category: 'respuesta', body: 'Hola {{nombre}}, ', quickReplies: [], sent: 0, replied: 0, updatedAt: s.clock });
        return [addActivity(s, 'sistema', 'Se creó una plantilla nueva.', `/app/plantillas/?id=${selected}`)];
      });
      setQuery('id', selected);
      loaded = '';
      render(getState());
      nameI.select();
      nameI.focus();
      return;
    }
    const del = t.closest<HTMLButtonElement>('[data-delete]');
    if (del) {
      const s = getState();
      const inUse = s.flows.some((f) => f.nodes.some((n) => n.value === selected)) || s.campaigns.some((c) => c.templateId === selected);
      if (inUse) {
        toast('No se puede eliminar', 'La usa una automatización o campaña. Cambiala allí primero.');
        return;
      }
      const name = current()?.name ?? '';
      mutate((st) => {
        st.templates = st.templates.filter((x) => x.id !== selected);
      });
      selected = getState().templates[0]?.id ?? '';
      setQuery('id', selected);
      loaded = '';
      render(getState());
      toast('Plantilla eliminada', name);
    }
  };
  const onSubmit = (ev: Event) => ev.preventDefault();

  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('click', onClick);
  form.addEventListener('submit', onSubmit);
  render(getState());
  const unsub = subscribe(render);
  return () => {
    unsub();
    window.clearTimeout(timer);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onInput);
    root.removeEventListener('click', onClick);
    form.removeEventListener('submit', onSubmit);
  };
}
