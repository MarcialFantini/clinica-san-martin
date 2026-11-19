// Flow editor: drag nodes, connect ports, edit in the inspector, run step by step and watch
// live engine runs travel through the connections. Every action has a keyboard path.
import { navigate } from 'astro:transitions/client';
import { ACTIONS, CONDITIONS, KIND_META, NODE_H, NODE_W, TRIGGERS } from '../../../lib/flowmeta';
import { icon } from '../../../lib/icons';
import { addActivity, nextId } from '../../../lib/ops';
import { getState, mutate, onEvent, subscribe } from '../../../lib/store';
import { hhmm } from '../../../lib/time';
import type { AppState, Flow, FlowEdge, FlowNode, NodeKind, TriggerType } from '../../../lib/types';
import { $, esc, query, reducedMotion, setQuery } from '../dom';
import { toast } from '../toasts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULTS: Record<NodeKind, { title: string; detail: string; value: string }> = {
  trigger: { title: 'Disparador', detail: 'Evento de la clínica', value: 'manual' },
  wait: { title: 'Esperar', detail: '24 h', value: '24' },
  message: { title: 'Enviar mensaje', detail: 'Plantilla: Recordatorio 24 h', value: 'T-REC24' },
  condition: { title: '¿Respondió?', detail: 'Confirmo o Reprogramo', value: 'respondio' },
  action: { title: 'Avisar a recepción', detail: 'Notificación interna', value: 'notificar-recepcion' },
  end: { title: 'Fin', detail: 'Termina el flujo', value: 'fin' },
};

export function mount(root: HTMLElement): () => void {
  const canvas = $('[data-canvas]', root)!;
  const world = $('[data-world]', root)!;
  const edgesSvg = $<SVGSVGElement>('[data-edges]', root) as unknown as SVGSVGElement;
  const nodesEl = $('[data-nodes]', root)!;
  const stepsEl = $('[data-steps]', root)!;
  const insp = $('[data-insp-body]', root)!;
  const logEl = $('[data-log]', root)!;
  const nameInput = $<HTMLInputElement>('[data-name]', root)!;
  const triggerSel = $<HTMLSelectElement>('[data-trigger]', root)!;
  const activeBtn = $<HTMLButtonElement>('[data-active]', root)!;
  const savedEl = $('[data-saved]', root)!;
  const runBtn = $<HTMLButtonElement>('[data-run]', root)!;
  const liveCount = $('[data-live-count]', root)!;

  // Resolve the flow (create one for ?nuevo=1).
  let flowId = query('id') ?? '';
  if (query('nuevo')) {
    mutate((s) => {
      flowId = nextId(s, 'F');
      s.flows.push({
        id: flowId, name: 'Nueva automatización', description: 'Flujo creado en el editor.', trigger: 'manual', active: false, runs: 0, lastRunAt: null, createdAt: s.clock,
        nodes: [{ id: 'n1', kind: 'trigger', x: 40, y: 200, ...DEFAULTS.trigger }], edges: [],
      });
      return [addActivity(s, 'flujo', 'Se creó una automatización nueva en el editor.', `/app/flujos/editor/?id=${flowId}`)];
    });
    setQuery('nuevo', null);
    setQuery('id', flowId);
    toast('Automatización creada', 'Agregá pasos desde la izquierda y conectalos.');
  }
  if (!getState().flows.some((f) => f.id === flowId)) {
    flowId = getState().flows[0]?.id ?? '';
    setQuery('id', flowId);
  }

  const flow = (s: AppState = getState()): Flow | undefined => s.flows.find((f) => f.id === flowId);
  let selected: string | null = null;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let running = false;
  let liveBusy = false;
  let liveRuns = 0;
  let stopRun = false;
  let renderedInsp = '';
  let savedTimer: number | undefined;

  const edit = (fn: (f: Flow, s: AppState) => void) => {
    mutate((s) => {
      const f = flow(s);
      if (f) fn(f, s);
    });
    savedEl.textContent = 'Guardando…';
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => (savedEl.textContent = 'Guardado en este navegador'), 500);
  };

  // ---------------------------------------------------------------- geometry
  const outPoint = (n: FlowNode, branch?: 'si' | 'no') => ({ x: n.x + NODE_W, y: n.y + (branch === 'si' ? 20 : branch === 'no' ? 58 : NODE_H / 2) });
  const inPoint = (n: FlowNode) => ({ x: n.x, y: n.y + NODE_H / 2 });
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
    return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
  };
  const applyView = () => {
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  const fit = () => {
    const f = flow();
    if (!f || !f.nodes.length) return;
    const minX = Math.min(...f.nodes.map((n) => n.x)) - 30;
    const minY = Math.min(...f.nodes.map((n) => n.y)) - 30;
    const maxX = Math.max(...f.nodes.map((n) => n.x + NODE_W)) + 30;
    const maxY = Math.max(...f.nodes.map((n) => n.y + NODE_H)) + 30;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    scale = Math.min(1.1, cw / (maxX - minX), ch / (maxY - minY));
    tx = (cw - (maxX - minX) * scale) / 2 - minX * scale;
    ty = (ch - (maxY - minY) * scale) / 2 - minY * scale;
    applyView();
  };
  const toWorld = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - tx) / scale, y: (clientY - r.top - ty) / scale };
  };

  // ---------------------------------------------------------------- render
  const nodeHtml = (n: FlowNode) => {
    const meta = KIND_META[n.kind];
    const ports =
      (n.kind !== 'trigger' ? '<span class="port in" aria-hidden="true"></span>' : '') +
      (n.kind === 'condition'
        ? '<span class="port out si" data-port="si" title="Si es sí" aria-hidden="true"></span><span class="port out no" data-port="no" title="Si es no" aria-hidden="true"></span>'
        : n.kind !== 'end'
          ? '<span class="port out" data-port="" title="Conectar" aria-hidden="true"></span>'
          : '');
    return `<div class="fe-node" role="button" tabindex="0" aria-roledescription="paso movible" data-node="${n.id}" style="--k:${meta.hue}">
      <span class="kind">${esc(meta.label)}</span>
      <span class="k-icon">${icon(meta.icon)}</span><b class="ellipsis">${esc(n.title)}</b><small class="ellipsis">${esc(n.detail)}</small>${ports}</div>`;
  };

  const renderEdges = (f: Flow) => {
    const byId = new Map(f.nodes.map((n) => [n.id, n]));
    let layer = edgesSvg.querySelector('g.edges');
    if (!layer) {
      layer = document.createElementNS(SVG_NS, 'g');
      layer.setAttribute('class', 'edges');
      edgesSvg.prepend(layer);
    }
    layer.innerHTML = f.edges
      .map((e) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return '';
        const p1 = outPoint(a, e.branch);
        const p2 = inPoint(b);
        const label = e.branch ? `<text x="${p1.x + 12}" y="${p1.y - 6}">${e.branch === 'si' ? 'Sí' : 'No'}</text>` : '';
        const sel = selected && (e.from === selected || e.to === selected) ? ' sel' : '';
        return `<path class="edge${sel}" data-edge="${e.id}" d="${curve(p1, p2)}"/>${label}`;
      })
      .join('');
  };

  const placeNodes = (f: Flow) => {
    for (const n of f.nodes) {
      const el = nodesEl.querySelector<HTMLElement>(`[data-node="${n.id}"]`);
      if (el) el.style.transform = `translate(${n.x}px, ${n.y}px)`;
    }
  };

  const renderNodes = (f: Flow) => {
    const existing = new Map([...nodesEl.children].map((el) => [(el as HTMLElement).dataset.node ?? '', el as HTMLElement]));
    for (const n of f.nodes) {
      const sig = `${n.kind}|${n.title}|${n.detail}`;
      let el = existing.get(n.id);
      if (!el || el.dataset.sig !== sig) {
        const t = document.createElement('template');
        t.innerHTML = nodeHtml(n).trim();
        const fresh = t.content.firstElementChild as HTMLElement;
        fresh.dataset.sig = sig;
        const hadFocus = el && document.activeElement === el;
        if (el) el.replaceWith(fresh);
        else nodesEl.append(fresh);
        el = fresh;
        if (hadFocus) el.focus();
      }
      el.classList.toggle('selected', n.id === selected);
      existing.delete(n.id);
    }
    for (const el of existing.values()) el.remove();
    placeNodes(f);
  };

  const describe = (n: FlowNode, s: AppState) => {
    switch (n.kind) {
      case 'trigger': return TRIGGERS[n.value as TriggerType] ?? n.detail;
      case 'wait': return `Espera ${n.value} h`;
      case 'message': return `Envía «${s.templates.find((t) => t.id === n.value)?.name ?? 'plantilla'}»`;
      case 'condition': return CONDITIONS[n.value] ?? n.title;
      case 'action': return ACTIONS[n.value] ?? n.title;
      default: return 'Termina el flujo';
    }
  };

  const renderSteps = (f: Flow, s: AppState) => {
    const titles = new Map(f.nodes.map((n) => [n.id, n.title]));
    const sig = JSON.stringify([f.nodes.map((n) => [n.id, n.title, n.value, n.kind]), f.edges, selected]);
    if (stepsEl.dataset.sig === sig) return;
    stepsEl.dataset.sig = sig;
    stepsEl.innerHTML = f.nodes
      .map((n) => {
        const outs = f.edges.filter((e) => e.from === n.id);
        const next = outs.length ? outs.map((e) => `${e.branch ? (e.branch === 'si' ? 'Sí → ' : 'No → ') : '→ '}${esc(titles.get(e.to) ?? '')}`).join(' · ') : n.kind === 'end' ? '' : 'Sin conexión';
        const meta = KIND_META[n.kind];
        return `<li data-step="${n.id}"><button type="button" data-select="${n.id}" aria-current="${n.id === selected}" style="--k:${meta.hue}"><span class="k-icon">${icon(meta.icon)}</span><span><b>${esc(n.title)}</b><br><small>${esc(describe(n, s))}</small></span><small>${next}</small></button></li>`;
      })
      .join('');
  };

  const renderInspector = (f: Flow, s: AppState) => {
    const n = f.nodes.find((x) => x.id === selected);
    const key = n ? `${n.id}|${f.nodes.length}|${f.edges.length}|${s.templates.length}` : 'none';
    if (renderedInsp === key) return;
    renderedInsp = key;
    if (!n) {
      insp.innerHTML = '<p class="muted small">Elegí un nodo del diagrama o de la lista de pasos. Con el teclado: Tab hasta un nodo, flechas para moverlo, Supr para borrarlo.</p>';
      return;
    }
    const others = f.nodes.filter((x) => x.id !== n.id && x.kind !== 'trigger');
    const target = (branch?: 'si' | 'no') => f.edges.find((e) => e.from === n.id && (branch ? e.branch === branch : !e.branch))?.to ?? '';
    const connectSelect = (label: string, branch?: 'si' | 'no') => `<div class="field"><label for="conn-${branch ?? 'next'}">${label}</label>
      <select class="select" id="conn-${branch ?? 'next'}" data-connect="${branch ?? ''}"><option value="">Sin conexión</option>${others.map((o) => `<option value="${o.id}" ${target(branch) === o.id ? 'selected' : ''}>${esc(o.title)}</option>`).join('')}</select></div>`;
    let valueField = '';
    if (n.kind === 'trigger') valueField = `<div class="field"><label for="node-value">Evento</label><select class="select" id="node-value" data-field="value">${Object.entries(TRIGGERS).map(([v, l]) => `<option value="${v}" ${v === n.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    if (n.kind === 'wait') valueField = `<div class="field"><label for="node-value">Horas de espera</label><input class="input" id="node-value" type="number" min="1" max="96" value="${esc(n.value)}" data-field="value" /></div>`;
    if (n.kind === 'message') {
      const tpl = s.templates.find((t) => t.id === n.value);
      valueField = `<div class="field"><label for="node-value">Plantilla</label><select class="select" id="node-value" data-field="value">${s.templates.map((t) => `<option value="${t.id}" ${t.id === n.value ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <p class="small muted" data-tpl-preview>${esc(tpl?.body ?? '')}</p><p class="small"><a href="/app/plantillas/?id=${esc(n.value)}">Editar la plantilla</a></p>`;
    }
    if (n.kind === 'condition') valueField = `<div class="field"><label for="node-value">Pregunta</label><select class="select" id="node-value" data-field="value">${Object.entries(CONDITIONS).map(([v, l]) => `<option value="${v}" ${v === n.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    if (n.kind === 'action') valueField = `<div class="field"><label for="node-value">Acción</label><select class="select" id="node-value" data-field="value">${Object.entries(ACTIONS).map(([v, l]) => `<option value="${v}" ${v === n.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    insp.innerHTML = `
      <p class="small" style="color:${KIND_META[n.kind].hue};font-weight:800">${esc(KIND_META[n.kind].label)}</p>
      <div class="field"><label for="node-title">Título</label><input class="input" id="node-title" maxlength="40" value="${esc(n.title)}" data-field="title" /></div>
      <div class="field"><label for="node-detail">Detalle</label><input class="input" id="node-detail" maxlength="50" value="${esc(n.detail)}" data-field="detail" /></div>
      ${valueField}
      ${n.kind === 'condition' ? connectSelect('Si es sí, sigue con', 'si') + connectSelect('Si es no, sigue con', 'no') : n.kind !== 'end' ? connectSelect('Sigue con') : ''}
      <div class="row">
        ${n.kind !== 'trigger' ? `<button class="btn btn-sm btn-danger" type="button" data-remove>${icon('trash')}Borrar paso</button>` : ''}
        <button class="btn btn-sm btn-ghost" type="button" data-deselect>Listo</button>
      </div>`;
  };

  const render = (s: AppState) => {
    const f = flow(s);
    if (!f) return;
    if (document.activeElement !== nameInput && nameInput.value !== f.name) nameInput.value = f.name;
    $('[data-crumb]', root)!.textContent = f.name;
    if (triggerSel.value !== f.trigger) triggerSel.value = f.trigger;
    activeBtn.setAttribute('aria-checked', String(f.active));
    $('#fe-active-lbl', root)!.textContent = f.active ? 'Activa' : 'Pausada';
    renderNodes(f);
    renderEdges(f);
    renderSteps(f, s);
    renderInspector(f, s);
  };

  const select = (id: string | null, focusNode = false) => {
    selected = id;
    renderedInsp = '';
    render(getState());
    if (focusNode && id) nodesEl.querySelector<HTMLElement>(`[data-node="${id}"]`)?.focus();
  };

  // ---------------------------------------------------------------- editing ops
  const connect = (from: string, to: string, branch?: 'si' | 'no') => {
    edit((f) => {
      f.edges = f.edges.filter((e) => !(e.from === from && (branch ? e.branch === branch : !e.branch)));
      if (to && to !== from) {
        const edge: FlowEdge = { id: `e${Date.now().toString(36)}${f.edges.length}`, from, to };
        if (branch) edge.branch = branch;
        f.edges.push(edge);
      }
    });
  };

  const addNode = (kind: NodeKind) => {
    const f = flow();
    if (!f) return;
    const anchor = f.nodes.find((n) => n.id === selected) ?? f.nodes[f.nodes.length - 1];
    let id = '';
    edit((fl) => {
      let i = fl.nodes.length + 1;
      while (fl.nodes.some((n) => n.id === `n${i}`)) i++;
      id = `n${i}`;
      const x = anchor ? anchor.x + NODE_W + 50 : 40;
      let y = anchor ? anchor.y : 200;
      while (fl.nodes.some((n) => Math.abs(n.x - x) < NODE_W && Math.abs(n.y - y) < NODE_H)) y += NODE_H + 30;
      fl.nodes.push({ id, kind, x, y, ...DEFAULTS[kind] });
      if (anchor && anchor.kind !== 'end') {
        const branch = anchor.kind === 'condition' ? (fl.edges.some((e) => e.from === anchor.id && e.branch === 'si') ? 'no' : 'si') : undefined;
        const taken = fl.edges.some((e) => e.from === anchor.id && (branch ? e.branch === branch : !e.branch));
        if (!taken) {
          const edge: FlowEdge = { id: `e${Date.now().toString(36)}`, from: anchor.id, to: id };
          if (branch) edge.branch = branch;
          fl.edges.push(edge);
        }
      }
    });
    select(id, true);
    const n = flow()?.nodes.find((x) => x.id === id);
    if (n) {
      const r = canvas.clientWidth;
      if (n.x * scale + tx > r - 40) fit();
    }
  };

  const removeNode = (id: string) => {
    const f = flow();
    const n = f?.nodes.find((x) => x.id === id);
    if (!f || !n || n.kind === 'trigger') return;
    edit((fl) => {
      fl.nodes = fl.nodes.filter((x) => x.id !== id);
      fl.edges = fl.edges.filter((e) => e.from !== id && e.to !== id);
    });
    toast('Paso borrado', `«${n.title}» y sus conexiones.`);
    select(f.nodes.find((x) => x.id !== id)?.id ?? null, true);
  };

  // ---------------------------------------------------------------- run animation
  const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
  const travel = (edgeId: string, ms: number) =>
    new Promise<void>((resolve) => {
      const path = edgesSvg.querySelector<SVGPathElement>(`[data-edge="${edgeId}"]`);
      if (!path || reducedMotion()) {
        path?.classList.add('lit');
        window.setTimeout(() => {
          path?.classList.remove('lit');
          resolve();
        }, Math.min(ms, 200));
        return;
      }
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', '8');
      dot.setAttribute('class', 'pulse');
      edgesSvg.append(dot);
      path.classList.add('lit');
      const len = path.getTotalLength();
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const p = path.getPointAtLength(len * e);
        dot.setAttribute('transform', `translate(${p.x} ${p.y})`);
        if (t < 1) requestAnimationFrame(step);
        else {
          dot.remove();
          window.setTimeout(() => path.classList.remove('lit'), 250);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });

  const flashNode = async (id: string, ms: number) => {
    const el = nodesEl.querySelector<HTMLElement>(`[data-node="${id}"]`);
    const step = stepsEl.querySelector(`[data-step="${id}"]`);
    el?.classList.add('active');
    step?.classList.add('active');
    await sleep(ms);
    el?.classList.remove('active');
    step?.classList.remove('active');
  };

  const log = (text: string) => {
    const li = document.createElement('li');
    li.className = 'fresh';
    li.innerHTML = `<time>${hhmm(getState().clock)}</time><span>${text}</span>`;
    logEl.prepend(li);
    while (logEl.children.length > 30) logEl.lastElementChild?.remove();
  };

  const play = async (path: string[], edges: string[], nodeMs: number, edgeMs: number, verbose: boolean) => {
    const f = flow();
    if (!f) return;
    const s = getState();
    for (let i = 0; i < path.length; i++) {
      if (stopRun) break;
      const n = f.nodes.find((x) => x.id === path[i]);
      if (!n) break;
      if (verbose) {
        const branch = n.kind === 'condition' ? f.edges.find((e) => e.id === edges[i])?.branch : undefined;
        log(`<b>${esc(n.title)}</b> · ${esc(describe(n, s))}${branch ? ` → ${branch === 'si' ? 'Sí' : 'No'}` : ''}`);
      }
      await flashNode(n.id, nodeMs);
      const edge = edges[i];
      if (edge && !stopRun) await travel(edge, edgeMs);
    }
  };

  const runManual = async () => {
    if (running) {
      stopRun = true;
      return;
    }
    const f = flow();
    if (!f) return;
    running = true;
    stopRun = false;
    runBtn.querySelector('[data-run-label]')!.textContent = 'Detener';
    runBtn.classList.replace('btn-primary', 'btn-danger');
    const decisions = new Map<string, 'si' | 'no'>();
    // Walk the graph choosing branches (65 % "sí").
    const path: string[] = [];
    const edges: string[] = [];
    let cur: FlowNode | undefined = f.nodes.find((n) => n.kind === 'trigger') ?? f.nodes[0];
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id) && path.length < 16) {
      seen.add(cur.id);
      path.push(cur.id);
      const outs = f.edges.filter((e) => e.from === cur?.id);
      if (!outs.length) break;
      let e: FlowEdge | undefined = outs[0];
      if (cur.kind === 'condition') {
        const b: 'si' | 'no' = Math.random() < 0.65 ? 'si' : 'no';
        decisions.set(cur.id, b);
        e = outs.find((o) => o.branch === b) ?? outs[0];
      }
      if (!e) break;
      edges.push(e.id);
      const to: string = e.to;
      cur = f.nodes.find((n) => n.id === to);
    }
    log('<b>Prueba manual</b> · el flujo arranca');
    const slow = reducedMotion();
    await play(path, edges, slow ? 250 : 520, slow ? 150 : 720, true);
    log(stopRun ? 'Prueba detenida' : `<b>Fin</b> · ${path.length} pasos ejecutados`);
    running = false;
    stopRun = false;
    runBtn.querySelector('[data-run-label]')!.textContent = 'Ejecutar paso a paso';
    runBtn.classList.replace('btn-danger', 'btn-primary');
  };

  // ---------------------------------------------------------------- pointer interactions
  type Drag =
    | { kind: 'node'; id: string; startX: number; startY: number; ox: number; oy: number; moved: boolean; el: HTMLElement }
    | { kind: 'pan'; startX: number; startY: number; tx0: number; ty0: number }
    | { kind: 'wire'; from: string; branch?: 'si' | 'no'; path: SVGPathElement; target: HTMLElement | null };
  let drag: Drag | null = null;

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const t = ev.target as Element;
    const port = t.closest<HTMLElement>('[data-port]');
    const nodeEl = t.closest<HTMLElement>('[data-node]');
    const f = flow();
    if (!f) return;
    if (port && nodeEl) {
      ev.preventDefault();
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'temp');
      edgesSvg.append(path);
      const branch = (port.dataset.port || undefined) as 'si' | 'no' | undefined;
      drag = branch ? { kind: 'wire', from: nodeEl.dataset.node ?? '', branch, path, target: null } : { kind: 'wire', from: nodeEl.dataset.node ?? '', path, target: null };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
    if (nodeEl) {
      const n = f.nodes.find((x) => x.id === nodeEl.dataset.node);
      if (!n) return;
      drag = { kind: 'node', id: n.id, startX: ev.clientX, startY: ev.clientY, ox: n.x, oy: n.y, moved: false, el: nodeEl };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
    drag = { kind: 'pan', startX: ev.clientX, startY: ev.clientY, tx0: tx, ty0: ty };
    canvas.classList.add('panning');
    canvas.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!drag) return;
    const f = flow();
    if (!f) return;
    if (drag.kind === 'pan') {
      tx = drag.tx0 + (ev.clientX - drag.startX);
      ty = drag.ty0 + (ev.clientY - drag.startY);
      applyView();
    } else if (drag.kind === 'node') {
      const dx = (ev.clientX - drag.startX) / scale;
      const dy = (ev.clientY - drag.startY) / scale;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      drag.el.classList.add('dragging');
      const n = f.nodes.find((x) => x.id === (drag as { id: string }).id);
      if (!n) return;
      // Live preview: mutate the in-memory node, commit on release.
      n.x = Math.round(drag.ox + dx);
      n.y = Math.round(drag.oy + dy);
      drag.el.style.transform = `translate(${n.x}px, ${n.y}px)`;
      renderEdges(f);
    } else {
      const from = f.nodes.find((x) => x.id === (drag as { from: string }).from);
      if (!from) return;
      const p = toWorld(ev.clientX, ev.clientY);
      drag.path.setAttribute('d', curve(outPoint(from, drag.branch), p));
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-node]') ?? null;
      if (drag.target !== under) {
        drag.target?.classList.remove('drop-target');
        drag.target = under && under.dataset.node !== drag.from ? under : null;
        drag.target?.classList.add('drop-target');
      }
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    canvas.classList.remove('panning');
    if (d.kind === 'node') {
      d.el.classList.remove('dragging');
      if (d.moved) {
        const n = flow()?.nodes.find((x) => x.id === d.id);
        if (n) {
          const x = Math.round(n.x / 10) * 10;
          const y = Math.round(n.y / 10) * 10;
          edit((f) => {
            const m = f.nodes.find((q) => q.id === d.id);
            if (m) {
              m.x = x;
              m.y = y;
            }
          });
        }
      }
      if (selected !== d.id) select(d.id);
    } else if (d.kind === 'wire') {
      d.path.remove();
      d.target?.classList.remove('drop-target');
      const to = d.target?.dataset.node;
      const target = flow()?.nodes.find((n) => n.id === to);
      if (to && target && target.kind !== 'trigger') {
        connect(d.from, to, d.branch);
        toast('Pasos conectados', `${flow()?.nodes.find((n) => n.id === d.from)?.title ?? ''} → ${target.title}`);
      }
    }
  };

  const onWheel = (ev: WheelEvent) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const my = ev.clientY - r.top;
    const next = Math.min(1.6, Math.max(0.3, scale * (ev.deltaY < 0 ? 1.1 : 0.9)));
    tx = mx - ((mx - tx) / scale) * next;
    ty = my - ((my - ty) / scale) * next;
    scale = next;
    applyView();
  };

  // ---------------------------------------------------------------- keyboard and form events
  const onKeyDown = (ev: KeyboardEvent) => {
    const nodeEl = (ev.target as Element).closest<HTMLElement>('[data-node]');
    if (!nodeEl) return;
    const id = nodeEl.dataset.node ?? '';
    const step = ev.shiftKey ? 50 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = moves[ev.key];
    if (mv) {
      ev.preventDefault();
      if (selected !== id) select(id, true);
      edit((f) => {
        const n = f.nodes.find((x) => x.id === id);
        if (n) {
          n.x += mv[0];
          n.y += mv[1];
        }
      });
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      removeNode(id);
      return;
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      select(id);
      if (ev.key === 'Enter') $<HTMLInputElement>('#node-title', insp)?.focus();
      return;
    }
    if (ev.key === 'Escape') select(null);
  };
  const onFocusIn = (ev: FocusEvent) => {
    const nodeEl = (ev.target as Element).closest<HTMLElement>('[data-node]');
    if (nodeEl && nodeEl.dataset.node !== selected) {
      selected = nodeEl.dataset.node ?? null;
      renderedInsp = '';
      const f = flow();
      if (f) {
        for (const el of nodesEl.children) el.classList.toggle('selected', (el as HTMLElement).dataset.node === selected);
        renderEdges(f);
        renderSteps(f, getState());
        renderInspector(f, getState());
      }
    }
  };

  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    const add = t.closest<HTMLElement>('[data-add]');
    if (add) return addNode(add.dataset.add as NodeKind);
    const sel = t.closest<HTMLElement>('[data-select]');
    if (sel) return select(sel.dataset.select ?? null, true);
    if (t.closest('[data-remove]') && selected) return removeNode(selected);
    if (t.closest('[data-deselect]')) {
      const prev = selected;
      select(null);
      if (prev) nodesEl.querySelector<HTMLElement>(`[data-node="${prev}"]`)?.focus();
      return;
    }
    if (t.closest('[data-run]')) return void runManual();
    if (t.closest('[data-fit]')) return fit();
    if (t.closest('[data-active]')) {
      let on = false;
      edit((f, s) => {
        if (!f.active && f.trigger !== 'manual') for (const o of s.flows) if (o.trigger === f.trigger) o.active = false;
        f.active = !f.active;
        on = f.active;
      });
      toast(on ? 'Automatización activa' : 'Automatización pausada', on ? 'El motor la ejecuta con cada evento.' : 'Ya no se ejecuta sola.');
      return;
    }
    const del = t.closest<HTMLButtonElement>('[data-delete-flow]');
    if (del) {
      if (del.dataset.armed !== 'true') {
        del.dataset.armed = 'true';
        del.textContent = '¿Seguro? Tocá de nuevo';
        window.setTimeout(() => {
          del.dataset.armed = 'false';
          del.textContent = 'Eliminar';
        }, 3000);
        return;
      }
      const name = flow()?.name ?? '';
      mutate((s) => {
        s.flows = s.flows.filter((f) => f.id !== flowId);
        return [addActivity(s, 'flujo', `Se eliminó la automatización ${name}.`)];
      });
      toast('Automatización eliminada', name);
      void navigate('/app/flujos/');
    }
  };

  const onInput = (ev: Event) => {
    const t = ev.target as HTMLInputElement | HTMLSelectElement;
    if (t === nameInput) return edit((f) => void (f.name = nameInput.value.trim() || 'Sin nombre'));
    const field = t.dataset.field as 'title' | 'detail' | 'value' | undefined;
    if (field && selected) {
      const id = selected;
      edit((f, s) => {
        const n = f.nodes.find((x) => x.id === id);
        if (!n) return;
        n[field] = t.value;
        if (field === 'value') {
          if (n.kind === 'trigger') f.trigger = t.value as TriggerType;
          if (n.kind === 'wait') n.detail = `${t.value} h`;
          if (n.kind === 'message') {
            const tpl = s.templates.find((x) => x.id === t.value);
            n.detail = `Plantilla: ${tpl?.name ?? ''}`;
            const pv = $('[data-tpl-preview]', insp);
            if (pv) pv.textContent = tpl?.body ?? '';
          }
          if (n.kind === 'action') n.title = ACTIONS[t.value] ?? n.title;
          if (n.kind === 'condition') n.title = CONDITIONS[t.value] ?? n.title;
          const detail = $<HTMLInputElement>('#node-detail', insp);
          const title = $<HTMLInputElement>('#node-title', insp);
          if (detail) detail.value = n.detail;
          if (title) title.value = n.title;
        }
      });
    }
  };
  const onChange = (ev: Event) => {
    const t = ev.target as HTMLSelectElement;
    if (t === triggerSel) {
      edit((f) => {
        f.trigger = t.value as TriggerType;
        const trig = f.nodes.find((n) => n.kind === 'trigger');
        if (trig) {
          trig.value = t.value;
          trig.title = TRIGGERS[t.value as TriggerType];
        }
      });
      return;
    }
    if (t.dataset.connect !== undefined && selected) {
      connect(selected, t.value, (t.dataset.connect || undefined) as 'si' | 'no' | undefined);
      renderedInsp = '';
    }
  };

  // ---------------------------------------------------------------- live engine runs
  const unEvent = onEvent((e) => {
    if (e.type !== 'flow-run' || e.flowId !== flowId) return;
    liveRuns++;
    liveCount.textContent = `${liveRuns} en vivo desde que abriste el editor`;
    if (running || liveBusy) return;
    liveBusy = true;
    log(`<b>En vivo</b> · ${esc(e.label)}`);
    const fast = getState().sim.speed >= 10;
    void play(e.path, e.edges, fast ? 120 : 260, fast ? 260 : 480, false).then(() => {
      liveBusy = false;
    });
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  const ro = new ResizeObserver(() => fit());
  ro.observe(canvas);

  render(getState());
  fit();
  const unsub = subscribe((s) => {
    if (!drag) render(s);
  });
  log('Editor abierto. Las ejecuciones en vivo aparecen acá.');

  return () => {
    stopRun = true;
    unsub();
    unEvent();
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    root.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
  };
}
