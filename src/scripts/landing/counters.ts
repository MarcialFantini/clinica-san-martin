// Scenes 5 and 6: animated counters for the board, and the before/after timelines growing in.

export interface ReplayController {
  demo(): Promise<void>;
}

function countUp(el: HTMLElement, to: number, reduced: boolean): void {
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
  if (reduced) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const dur = 1400;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = fmt(to * (1 - Math.pow(1 - t, 4)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initBoard(root: HTMLElement, opts: { reduced: boolean }): ReplayController {
  const play = () => {
    root.classList.remove('in');
    void root.offsetWidth;
    root.classList.add('in');
    for (const el of root.querySelectorAll<HTMLElement>('[data-count-to]')) countUp(el, Number(el.dataset.countTo), opts.reduced);
  };
  play();
  return { demo: async () => play() };
}

export function initTimeline(root: HTMLElement): ReplayController {
  const tl = root.querySelector<HTMLElement>('[data-tl]');
  const play = () => {
    if (!tl) return;
    tl.classList.remove('in');
    void tl.offsetWidth;
    // Two frames so the collapsed state is painted before growing again.
    requestAnimationFrame(() => requestAnimationFrame(() => tl.classList.add('in')));
  };
  play();
  return { demo: async () => play() };
}
