// `?showcase`: scripted ~27 s loop through the six scenes for the portfolio video.
// No cursor, no input needed, nothing written to storage.
import type { Controllers } from './main';

interface Step {
  sel: string;
  hold: number;
  act?: (c: Controllers) => void;
}

const STEPS: Step[] = [
  { sel: '.hero', hold: 4400, act: (c) => window.setTimeout(() => c.hero?.forward(), 1400) },
  { sel: '#bandeja', hold: 4800, act: (c) => void c.bandeja?.demo() },
  { sel: '#confirmaciones', hold: 4000, act: (c) => void c.confirmaciones?.demo() },
  { sel: '#flujo', hold: 5200, act: (c) => void c.flujo?.demo() },
  { sel: '#resultados', hold: 3000, act: (c) => void c.resultados?.demo() },
  { sel: '#antes-despues', hold: 3400, act: (c) => void c['antes-despues']?.demo() },
];

function scrollToY(y: number, dur: number): Promise<void> {
  const from = window.scrollY;
  const start = performance.now();
  return new Promise((resolve) => {
    if (dur <= 0) {
      window.scrollTo(0, y);
      resolve();
      return;
    }
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo(0, from + (y - from) * e);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function targetY(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  const top = r.top + window.scrollY;
  const vh = window.innerHeight;
  // Center shorter scenes; start taller ones a little above their top.
  return r.height < vh ? Math.max(0, top - (vh - r.height) / 2) : Math.max(0, top - 24);
}

export function runShowcase(c: Controllers, reduced: boolean): void {
  document.documentElement.style.scrollBehavior = 'auto';
  let i = 0;
  const next = async () => {
    const step = STEPS[i % STEPS.length]!;
    i++;
    const el = document.querySelector<HTMLElement>(step.sel);
    if (el) {
      const scene = step.sel === '#flujo' ? el.querySelector<HTMLElement>('.flow-canvas') ?? el : el;
      await scrollToY(step.sel === '.hero' ? 0 : targetY(step.sel === '#flujo' ? scene : el), reduced ? 0 : 700);
    }
    step.act?.(c);
    window.setTimeout(() => void next(), step.hold);
  };
  void next();
}
