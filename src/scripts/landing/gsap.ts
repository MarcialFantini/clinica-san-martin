// Lazy GSAP loading: the core and plugins are only fetched when a scene that needs them is near.
import type { gsap as GsapType } from 'gsap';

type Gsap = typeof GsapType;

let core: Promise<Gsap> | null = null;
let drag: Promise<{ gsap: Gsap; Draggable: typeof import('gsap/Draggable').Draggable }> | null = null;

export function loadGsap(): Promise<Gsap> {
  core ??= Promise.all([import('gsap'), import('gsap/MotionPathPlugin')]).then(([g, mp]) => {
    g.gsap.registerPlugin(mp.MotionPathPlugin);
    return g.gsap;
  });
  return core;
}

export function loadDraggable() {
  drag ??= Promise.all([loadGsap(), import('gsap/Draggable')]).then(([gsap, d]) => {
    gsap.registerPlugin(d.Draggable);
    return { gsap, Draggable: d.Draggable };
  });
  return drag;
}
