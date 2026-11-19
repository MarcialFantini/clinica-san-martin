// Scene 2: messages arrive, the classifier's tag flies to each one, and the message travels
// along a curved path (MotionPathPlugin) to its professional's lane.
import { AMBIGUOUS, FIRST_NAMES, INQUIRIES, LAST_NAMES, SPECIALTIES } from '../../data/catalog';
import { classify } from '../../lib/classify';
import { createRng } from '../../lib/rng';
import { LANES, type Lane } from '../../components/landing/data';
import { loadGsap } from './gsap';

const MAX_MESSAGES = 5;
const AUTO_EVERY = 3400;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface InboxController {
  demo(): Promise<void>;
}

export async function initInbox(root: HTMLElement, opts: { reduced: boolean; showcase: boolean }): Promise<InboxController> {
  const gsap = opts.reduced ? null : await loadGsap();
  const stage = root.querySelector<HTMLElement>('[data-inbox-stage]')!;
  const list = root.querySelector<HTMLElement>('[data-msg-list]')!;
  const fly = root.querySelector<HTMLElement>('[data-fly]')!;
  const classifier = root.querySelector<HTMLElement>('[data-classifier]')!;
  const classifierLabel = root.querySelector<HTMLElement>('[data-classifier-label]')!;
  const form = root.querySelector<HTMLFormElement>('[data-simulate]')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const result = root.querySelector<HTMLElement>('[data-sim-result]')!;
  const rng = createRng(2611);
  const laneById = new Map(LANES.map((l) => [l.id, l]));
  let filter: string = 'todas';
  let busy = false;
  let visible = false;
  let timer = 0;

  const laneEl = (id: string) => root.querySelector<HTMLElement>(`.lane[data-lane="${id}"]`);

  function rel(el: Element) {
    const a = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return { x: a.left - s.left, y: a.top - s.top, w: a.width, h: a.height };
  }

  function applyFilter(): void {
    for (const li of list.querySelectorAll<HTMLElement>('.msg')) li.hidden = filter !== 'todas' && li.dataset.lane !== filter;
    for (const lane of root.querySelectorAll<HTMLElement>('.lane')) lane.classList.toggle('dim', filter !== 'todas' && lane.dataset.lane !== filter);
  }

  function bumpLane(id: string): void {
    const el = laneEl(id);
    if (!el) return;
    const count = el.querySelector<HTMLElement>('[data-lane-count]');
    if (count) count.textContent = String(Number(count.textContent) + 1);
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
    window.setTimeout(() => el.classList.remove('hit'), 1400);
  }

  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

  async function route(name: string, text: string): Promise<Lane> {
    busy = true;
    const c = classify(text);
    const lane = laneById.get(c.specialty ?? 'recepcion') ?? laneById.get('recepcion')!;
    const li = document.createElement('li');
    li.className = 'msg';
    li.dataset.lane = lane.id;
    li.innerHTML = `<p class="msg-name">${esc(name)}</p><p class="msg-text">${esc(text)}</p><p class="msg-tag"><span class="msg-pending">Clasificando…</span></p>`;
    list.prepend(li);
    while (list.children.length > MAX_MESSAGES) list.lastElementChild?.remove();
    applyFilter();
    const tagHtml = `<span class="lp-tag" style="--h:${lane.hue}">${esc(lane.name)}</span>`;
    const routeHtml = `<span class="msg-route">a ${esc(lane.pro)}</span>`;
    const tagSlot = li.querySelector<HTMLElement>('.msg-tag')!;

    if (!gsap) {
      tagSlot.innerHTML = tagHtml + routeHtml;
      classifierLabel.textContent = lane.short;
      bumpLane(lane.id);
      busy = false;
      return lane;
    }

    gsap.from(li, { y: -16, opacity: 0, duration: 0.45, ease: 'power3.out' });
    classifier.classList.remove('busy');
    void classifier.offsetWidth;
    classifier.classList.add('busy');
    classifierLabel.textContent = 'leyendo…';
    await wait(550);
    classifierLabel.textContent = lane.short;

    // 1. The tag flies from the classifier to the message.
    const visibleLi = !li.hidden && li.offsetParent !== null;
    const showClassifier = classifier.offsetParent !== null;
    if (visibleLi) {
      const from = showClassifier ? rel(classifier) : rel(laneEl(lane.id) ?? classifier);
      const to = rel(tagSlot);
      const chip = document.createElement('span');
      chip.className = 'fly lp-tag';
      chip.style.setProperty('--h', String(lane.hue));
      chip.textContent = lane.name;
      fly.append(chip);
      const sx = from.x + from.w / 2 - 50;
      const sy = from.y + from.h / 2 - 12;
      await gsap
        .fromTo(
          chip,
          { x: sx, y: sy, scale: 0.6, opacity: 0 },
          {
            motionPath: { path: [{ x: sx, y: sy }, { x: (sx + to.x) / 2, y: Math.min(sy, to.y) - 60 }, { x: to.x, y: to.y }], curviness: 1.1 },
            scale: 1,
            opacity: 1,
            duration: 0.7,
            ease: 'power2.inOut',
          },
        )
        .then();
      chip.remove();
    }
    tagSlot.innerHTML = tagHtml + routeHtml;
    if (visibleLi) gsap.from(tagSlot.firstElementChild, { scale: 1.25, duration: 0.35, ease: 'back.out(3)' });

    // 2. A ticket with the message travels to the professional's lane.
    const target = laneEl(lane.id);
    if (target && visibleLi) {
      const a = rel(li);
      const b = rel(target);
      const ticket = document.createElement('span');
      ticket.className = 'fly fly-ticket';
      ticket.textContent = name;
      fly.append(ticket);
      const x0 = a.x + a.w - 140;
      const y0 = a.y + 12;
      const x1 = b.x + 24;
      const y1 = b.y + b.h / 2 - 14;
      await gsap
        .fromTo(
          ticket,
          { x: x0, y: y0, opacity: 0 },
          {
            motionPath: { path: [{ x: x0, y: y0 }, { x: (x0 + x1) / 2, y: Math.min(y0, y1) - 80 }, { x: x1, y: y1 }], curviness: 1.25 },
            opacity: 1,
            duration: 0.95,
            ease: 'power2.inOut',
          },
        )
        .then();
      gsap.to(ticket, { opacity: 0, scale: 0.6, duration: 0.25, onComplete: () => ticket.remove() });
    }
    bumpLane(lane.id);
    busy = false;
    return lane;
  }

  function randomMessage(): { name: string; text: string } {
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (rng.chance(0.12)) return { name, text: rng.pick(AMBIGUOUS) };
    const spec = filter !== 'todas' && filter !== 'recepcion' ? SPECIALTIES.find((s) => s.id === filter) ?? rng.pick(SPECIALTIES) : rng.pick(SPECIALTIES);
    return { name, text: rng.pick(INQUIRIES[spec.id]) };
  }

  function schedule(): void {
    window.clearTimeout(timer);
    if (opts.reduced || opts.showcase) return;
    timer = window.setTimeout(async () => {
      if (visible && !busy && !document.hidden) {
        const m = randomMessage();
        await route(m.name, m.text);
      }
      schedule();
    }, AUTO_EVERY);
  }

  root.querySelector('[data-inbox-filters]')?.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest<HTMLButtonElement>('[data-filter]');
    if (!btn) return;
    filter = btn.dataset.filter ?? 'todas';
    for (const b of root.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', String(b === btn));
    applyFilter();
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    result.textContent = 'Enviando…';
    // Wait for any message already travelling, then route the visitor's one.
    while (busy) await wait(120);
    const c = classify(text);
    const lane = await route('Vos', text);
    result.textContent = c.specialty
      ? `Clasificada como ${lane.name} por ${c.matched.map((w) => `“${w}”`).join(', ')}. Derivada a ${lane.pro}, que la ve en su bandeja.`
      : 'No se reconoció una especialidad: la consulta pasa a Recepción y una persona responde en minutos.';
  });

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  }).observe(stage);
  schedule();

  return {
    async demo() {
      const text = 'Me duele la rodilla desde el partido del domingo';
      input.value = '';
      for (const ch of text) {
        input.value += ch;
        await wait(22);
      }
      await wait(250);
      form.requestSubmit();
    },
  };
}
