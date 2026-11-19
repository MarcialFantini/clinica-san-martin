// Scene 4: node flow editor. Nodes drag (GSAP Draggable) or move with the arrow keys; edges
// re-route live; "Ejecutar" sends a pulse along each connection of the path a patient would take.
import { FLOW_DESKTOP, FLOW_EDGES, FLOW_MOBILE, edgePath, type FlowLayout } from '../../components/landing/data';
import { loadDraggable } from './gsap';

type Gsap = Awaited<ReturnType<typeof loadDraggable>>['gsap'];

export interface FlowController {
  demo(): Promise<void>;
}

const STEP_TEXT: Record<string, string> = {
  t: 'Turno reservado',
  w: 'espera hasta 24 h antes',
  m: 'recordatorio enviado',
  c: '¿respondió?',
  y: 'sí: agenda actualizada',
  n: 'no: segundo aviso',
  r: 'aviso a recepción',
};

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export async function initFlow(root: HTMLElement, opts: { reduced: boolean }): Promise<FlowController> {
  const svg = root.querySelector<SVGSVGElement>('[data-flow-svg]')!;
  const pulses = root.querySelector<SVGGElement>('[data-pulses]')!;
  const log = root.querySelector<HTMLElement>('[data-flow-log]')!;
  const runBtn = root.querySelector<HTMLButtonElement>('[data-flow-run]')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('[data-flow-reset]')!;
  const nodes = new Map<string, SVGGElement>();
  for (const g of root.querySelectorAll<SVGGElement>('[data-node]')) nodes.set(g.dataset.node!, g);
  const mq = window.matchMedia('(max-width: 720px)');
  let layout: FlowLayout = mq.matches ? FLOW_MOBILE : FLOW_DESKTOP;
  let pos: Record<string, { x: number; y: number }> = structuredClone(layout.pos);
  let gsap: Gsap | null = null;
  let running = false;
  let runs = 0;

  function place(id: string): void {
    const g = nodes.get(id);
    const p = pos[id];
    if (!g || !p) return;
    if (gsap) gsap.set(g, { x: p.x, y: p.y });
    else g.setAttribute('transform', `translate(${p.x} ${p.y})`);
  }

  function updateEdges(): void {
    for (const e of FLOW_EDGES) {
      const path = svg.querySelector<SVGPathElement>(`[data-edge="${e.id}"]`);
      if (!path) continue;
      path.setAttribute('d', edgePath(pos[e.from]!, pos[e.to]!, layout.nodeW, layout.nodeH));
      const label = svg.querySelector<SVGGElement>(`[data-label="${e.id}"]`);
      if (label) {
        const mid = path.getPointAtLength(path.getTotalLength() / 2);
        label.setAttribute('transform', `translate(${mid.x} ${mid.y})`);
      }
    }
  }

  function applyLayout(): void {
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    for (const g of nodes.values()) {
      const box = g.querySelector('.f-box');
      const accent = g.querySelector('.f-accent');
      box?.setAttribute('width', String(layout.nodeW));
      box?.setAttribute('height', String(layout.nodeH));
      accent?.setAttribute('height', String(layout.nodeH - 24));
    }
    for (const id of nodes.keys()) place(id);
    updateEdges();
  }

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  function move(id: string, dx: number, dy: number): void {
    const p = pos[id];
    if (!p) return;
    p.x = clamp(p.x + dx, 0, layout.width - layout.nodeW);
    p.y = clamp(p.y + dy, 0, layout.height - layout.nodeH);
    place(id);
    updateEdges();
  }

  function tidy(animated: boolean): void {
    const target = structuredClone(layout.pos);
    if (!gsap || !animated) {
      pos = target;
      applyLayout();
      return;
    }
    for (const [id, p] of Object.entries(pos)) {
      gsap.to(p, { x: target[id]!.x, y: target[id]!.y, duration: 0.6, ease: 'power3.inOut', onUpdate: () => (place(id), updateEdges()) });
    }
  }

  // Keyboard: arrows move the focused node.
  for (const [id, g] of nodes) {
    g.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 40 : 10;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const delta = d[ev.key];
      if (!delta) return;
      ev.preventDefault();
      move(id, delta[0], delta[1]);
    });
  }

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    const yes = runs % 2 === 0;
    runs++;
    const order = yes ? ['e1', 'e2', 'e3', 'e4'] : ['e1', 'e2', 'e3', 'e5', 'e6'];
    const visited: string[] = ['t'];
    for (const g of nodes.values()) g.classList.remove('active');
    for (const p of svg.querySelectorAll('.f-edge')) p.classList.remove('lit');
    nodes.get('t')?.classList.add('active');
    if (!gsap || opts.reduced) {
      for (const id of order) {
        const e = FLOW_EDGES.find((x) => x.id === id)!;
        svg.querySelector(`[data-edge="${id}"]`)?.classList.add('lit');
        nodes.get(e.to)?.classList.add('active');
        visited.push(e.to);
      }
      log.textContent = `Ejecución ${runs}: ${visited.map((v) => STEP_TEXT[v]).join(' → ')}.`;
    } else {
      log.textContent = `Ejecución ${runs}: ${STEP_TEXT.t}`;
      const NS = 'http://www.w3.org/2000/svg';
      const halo = document.createElementNS(NS, 'circle');
      halo.setAttribute('r', '16');
      halo.setAttribute('class', 'f-pulse-halo');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', '8');
      dot.setAttribute('class', 'f-pulse');
      pulses.append(halo, dot);
      for (const id of order) {
        const e = FLOW_EDGES.find((x) => x.id === id)!;
        const path = svg.querySelector<SVGPathElement>(`[data-edge="${id}"]`)!;
        const len = path.getTotalLength();
        const o = { t: 0 };
        path.classList.add('lit');
        await gsap
          .to(o, {
            t: 1,
            duration: 0.62,
            ease: 'power1.inOut',
            onUpdate: () => {
              const pt = path.getPointAtLength(o.t * len);
              for (const c of [halo, dot]) {
                c.setAttribute('cx', String(pt.x));
                c.setAttribute('cy', String(pt.y));
              }
            },
          })
          .then();
        const node = nodes.get(e.to);
        node?.classList.add('active');
        if (node) gsap.fromTo(node.querySelector('.f-box'), { opacity: 0.6 }, { opacity: 1, duration: 0.4 });
        visited.push(e.to);
        log.textContent = `Ejecución ${runs}: ${visited.map((v) => STEP_TEXT[v]).join(' → ')}`;
        await wait(e.to === 'c' ? 380 : 160);
      }
      log.textContent += '.';
      gsap.to([halo, dot], { opacity: 0, duration: 0.4, onComplete: () => (halo.remove(), dot.remove()) });
    }
    window.setTimeout(() => {
      for (const g of nodes.values()) g.classList.remove('active');
      for (const p of svg.querySelectorAll('.f-edge')) p.classList.remove('lit');
    }, 2600);
    runBtn.disabled = false;
    running = false;
  }

  runBtn.addEventListener('click', () => void run());
  resetBtn.addEventListener('click', () => tidy(true));
  mq.addEventListener('change', () => {
    layout = mq.matches ? FLOW_MOBILE : FLOW_DESKTOP;
    pos = structuredClone(layout.pos);
    applyLayout();
  });
  applyLayout();

  // Dragging needs GSAP (user-driven, so it stays on with reduced motion); the keyboard works without it.
  {
    const loaded = await loadDraggable();
    gsap = loaded.gsap;
    for (const id of nodes.keys()) place(id);
    for (const [id, g] of nodes) {
      loaded.Draggable.create(g, {
        type: 'x,y',
        bounds: { minX: 0, minY: 0, maxX: layout.width - layout.nodeW, maxY: layout.height - layout.nodeH },
        onPress() {
          g.focus({ preventScroll: true });
          this.applyBounds({ minX: 0, minY: 0, maxX: layout.width - layout.nodeW, maxY: layout.height - layout.nodeH });
        },
        onDrag() {
          pos[id] = { x: this.x, y: this.y };
          updateEdges();
        },
      });
    }
  }

  return {
    async demo() {
      if (gsap && !opts.reduced) {
        const p = pos.n!;
        const from = { ...p };
        await gsap
          .to(p, { x: from.x - (mq.matches ? 0 : 40), y: from.y + (mq.matches ? 40 : 60), duration: 0.8, ease: 'power2.inOut', onUpdate: () => (place('n'), updateEdges()) })
          .then();
        await wait(200);
      }
      runs = 1; // the showcase shows the "no answer" branch, the longer path
      await run();
    },
  };
}
