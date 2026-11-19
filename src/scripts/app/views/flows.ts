// Automatizaciones: every flow with its live run counter, an on/off switch and a mini map
// whose connections light up each time the engine runs it.
import { KIND_META, NODE_H, NODE_W, TRIGGERS } from '../../../lib/flowmeta';
import { icon } from '../../../lib/icons';
import { addActivity } from '../../../lib/ops';
import { getState, mutate, onEvent, subscribe } from '../../../lib/store';
import { ago } from '../../../lib/time';
import type { AppState, Flow } from '../../../lib/types';
import { $, esc, fmt, keyed, reducedMotion } from '../dom';
import { toast } from '../toasts';

function miniMap(f: Flow): string {
  const xs = f.nodes.map((n) => n.x);
  const ys = f.nodes.map((n) => n.y);
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const w = Math.max(...xs, 0) + NODE_W - minX;
  const h = Math.max(...ys, 0) + NODE_H - minY;
  const byId = new Map(f.nodes.map((n) => [n.id, n]));
  const edges = f.edges
    .map((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return '';
      const x1 = a.x + NODE_W - minX;
      const y1 = a.y + NODE_H / 2 - minY;
      const x2 = b.x - minX;
      const y2 = b.y + NODE_H / 2 - minY;
      const mx = (x1 + x2) / 2;
      return `<path data-edge="${e.id}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
    })
    .join('');
  const nodes = f.nodes
    .map((n) => `<rect data-node="${n.id}" x="${n.x - minX}" y="${n.y - minY}" width="${NODE_W}" height="${NODE_H}" rx="16" style="fill:${KIND_META[n.kind].hue};fill-opacity:.18"/>`)
    .join('');
  return `<svg class="mini-flow ${f.active ? '' : 'off'}" viewBox="-10 -10 ${w + 20} ${h + 20}" preserveAspectRatio="xMinYMid meet" aria-hidden="true">${edges}${nodes}</svg>`;
}

export function mount(root: HTMLElement): () => void {
  const list = $('[data-flows]', root)!;
  list.innerHTML = '';

  const card = (f: Flow, s: AppState) => `<li class="card flow-card ${f.active ? '' : 'off'}" data-flow="${f.id}">
      <div>
        <h2><a href="/app/flujos/editor/?id=${f.id}">${esc(f.name)}</a></h2>
        <p class="desc">${esc(f.description)}</p>
        <p class="trigger">${icon('bolt')} <span>${esc(TRIGGERS[f.trigger])}</span> · <span class="muted">${f.nodes.length} pasos</span></p>
      </div>
      <div class="mini-wrap">${miniMap(f)}</div>
      <div class="flow-side">
        <div class="flow-stats">
          <div><b data-runs>${fmt(f.runs)}</b><span>ejecuciones</span></div>
          <div><b data-last style="font-size:18px">${f.lastRunAt !== null ? esc(ago(f.lastRunAt, s.clock)) : '—'}</b><span>última</span></div>
        </div>
        <div class="switch-row">
          <span id="lbl-${f.id}">${f.active ? 'Activa' : 'Pausada'}</span>
          <button class="switch" type="button" role="switch" aria-checked="${f.active}" aria-labelledby="lbl-${f.id}" aria-describedby="name-${f.id}" data-toggle="${f.id}"></button>
          <span id="name-${f.id}" class="sr-only">${esc(f.name)}</span>
        </div>
        <a class="btn btn-sm" href="/app/flujos/editor/?id=${f.id}">${icon('edit')}Editar</a>
      </div>
    </li>`;

  const render = (s: AppState) => {
    keyed(list, s.flows, (f) => f.id, (f) => card(f, s), (f) => `${f.active}|${f.name}|${f.description}|${f.trigger}|${JSON.stringify(f.nodes.map((n) => [n.x, n.y, n.kind]))}|${f.edges.length}`);
    for (const f of s.flows) {
      const el = list.querySelector(`[data-flow="${f.id}"]`);
      const runs = el?.querySelector('[data-runs]');
      if (runs && runs.textContent !== fmt(f.runs)) runs.textContent = fmt(f.runs);
      const last = el?.querySelector('[data-last]');
      const label = f.lastRunAt !== null ? ago(f.lastRunAt, s.clock) : '—';
      if (last && last.textContent !== label) last.textContent = label;
    }
  };

  const onClick = (ev: Event) => {
    const t = (ev.target as Element).closest<HTMLElement>('[data-toggle]');
    if (!t) return;
    const id = t.dataset.toggle;
    let name = '';
    let active = false;
    mutate((s) => {
      const f = s.flows.find((x) => x.id === id);
      if (!f) return [];
      // Only one active flow per trigger: turning one on pauses its siblings.
      if (!f.active && f.trigger !== 'manual') for (const o of s.flows) if (o.trigger === f.trigger) o.active = false;
      f.active = !f.active;
      name = f.name;
      active = f.active;
      return [addActivity(s, 'flujo', `${f.active ? 'Se activó' : 'Se pausó'} la automatización ${f.name}.`, `/app/flujos/editor/?id=${f.id}`)];
    });
    toast(active ? 'Automatización activa' : 'Automatización pausada', active ? `${name} vuelve a trabajar sola.` : `${name} dejó de ejecutarse. Recepción tendrá que hacerlo a mano.`);
    requestAnimationFrame(() => list.querySelector<HTMLElement>(`[data-toggle="${id}"]`)?.focus());
  };

  const pulse = (flowId: string, edges: string[], path: string[]) => {
    if (reducedMotion()) return;
    const svg = list.querySelector(`[data-flow="${flowId}"] svg`);
    if (!svg) return;
    edges.forEach((id, i) => {
      const p = svg.querySelector<SVGPathElement>(`[data-edge="${id}"]`);
      p?.animate([{ stroke: 'var(--aqua)' }, { stroke: 'var(--aqua)', offset: 0.6 }, { stroke: 'var(--surface-3)' }], { duration: 700, delay: i * 140, easing: 'ease-out' });
    });
    path.forEach((id, i) => {
      const r = svg.querySelector<SVGRectElement>(`[data-node="${id}"]`);
      r?.animate([{ fillOpacity: 0.18 }, { fillOpacity: 0.7 }, { fillOpacity: 0.18 }], { duration: 600, delay: i * 140 });
    });
  };

  root.addEventListener('click', onClick);
  render(getState());
  const unsub = subscribe(render);
  const unEvent = onEvent((e) => {
    if (e.type === 'flow-run') pulse(e.flowId, e.edges, e.path);
  });
  return () => {
    unsub();
    unEvent();
    root.removeEventListener('click', onClick);
  };
}
