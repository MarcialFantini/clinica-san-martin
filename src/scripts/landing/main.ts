// Landing entry: the hero starts after load; every other scene (and GSAP) is imported only
// when it comes near the viewport. `?showcase` loads everything and runs the scripted loop.
import { initHero, type HeroController } from './hero';

export interface Controllers {
  hero: HeroController | null;
  bandeja?: { demo(): Promise<void> };
  confirmaciones?: { demo(): Promise<void> };
  flujo?: { demo(): Promise<void> };
  resultados?: { demo(): Promise<void> };
  'antes-despues'?: { demo(): Promise<void> };
}

const html = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const showcase = html.classList.contains('showcase');
const poster = html.classList.contains('poster');
if (reduced) html.classList.add('rm');

const controllers: Controllers = { hero: null };
const pending = new Map<string, Promise<unknown>>();

type SceneId = Exclude<keyof Controllers, 'hero'>;

const LOADERS: Record<SceneId, (root: HTMLElement) => Promise<{ demo(): Promise<void> }>> = {
  bandeja: async (root) => (await import('./inbox')).initInbox(root, { reduced, showcase }),
  confirmaciones: async (root) => (await import('./confirm')).initConfirm(root, { reduced }),
  flujo: async (root) => (await import('./flow')).initFlow(root, { reduced }),
  resultados: async (root) => (await import('./counters')).initBoard(root, { reduced }),
  'antes-despues': async (root) => (await import('./counters')).initTimeline(root),
};

export function ensure(id: SceneId): Promise<unknown> {
  let p = pending.get(id);
  if (!p) {
    const root = document.querySelector<HTMLElement>(`[data-scene="${id}"]`);
    p = root
      ? LOADERS[id](root).then((c) => {
          controllers[id] = c;
          return c;
        })
      : Promise.resolve(null);
    pending.set(id, p);
  }
  return p;
}

// Scenes 5 and 6 animate on entry, so they load closer to the viewport than the interactive ones.
const ON_ENTRY: SceneId[] = ['resultados', 'antes-despues'];
const observe = (margin: string, threshold: number) =>
  new IntersectionObserver(
    (entries, obs) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        obs.unobserve(e.target);
        void ensure((e.target as HTMLElement).dataset.scene as SceneId);
      }
    },
    { rootMargin: margin, threshold },
  );
const early = observe('0px 0px 120px 0px', 0);
const onEntry = observe('0px', 0.3);
if (!showcase) {
  for (const el of document.querySelectorAll<HTMLElement>('[data-scene]')) {
    (ON_ENTRY.includes(el.dataset.scene as SceneId) ? onEntry : early).observe(el);
  }
}

function startHero(): void {
  controllers.hero = initHero({ reduced, poster });
  if (poster) window.setTimeout(() => html.setAttribute('data-poster-ready', 'true'), 3400);
}

const idle = (fn: () => void) =>
  typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 900 }) : window.setTimeout(fn, 200);

// The canvas is decoration for the static headline: start it once the page has settled.
const kick = () => window.setTimeout(() => idle(startHero), poster || showcase ? 0 : 700);
if (document.readyState === 'complete') kick();
else window.addEventListener('load', kick, { once: true });

if (showcase) {
  window.addEventListener(
    'load',
    async () => {
      await Promise.all((Object.keys(LOADERS) as SceneId[]).map((id) => ensure(id)));
      const { runShowcase } = await import('./showcase');
      runShowcase(controllers, reduced);
    },
    { once: true },
  );
}
