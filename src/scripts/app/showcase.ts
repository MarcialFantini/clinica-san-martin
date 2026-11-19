// App showcase (?showcase): clean in-memory state at 10x, touring the main views in a loop.
// Never touches the visitor's saved session (the store does not persist in this mode).
import { navigate } from 'astro:transitions/client';

const TOUR: Array<[string, number]> = [
  ['/app/', 5000],
  ['/app/bandeja/', 5000],
  ['/app/flujos/editor/?id=F-REC', 6000],
  ['/app/agenda/', 4500],
  ['/app/metricas/', 4500],
];

export function startShowcase(): void {
  const style = document.createElement('style');
  style.textContent = 'html.showcase, html.showcase * { cursor: none !important; } html.showcase .skip-link { display: none; }';
  document.head.append(style);
  let i = 0;
  const step = () => {
    i = (i + 1) % TOUR.length;
    const [href, wait] = TOUR[i] ?? TOUR[0]!;
    void navigate(href);
    window.setTimeout(step, wait);
  };
  window.setTimeout(step, TOUR[0]![1]);
}
