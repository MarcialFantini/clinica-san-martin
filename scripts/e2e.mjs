// End-to-end smoke test against the built site (run `pnpm build` first).
// Visits every view at desktop and 390 px, with and without reduced motion, the showcase modes,
// and fails on any console error or warning, page error, or horizontal overflow.
// Usage: pnpm test:e2e [--shots]   (screenshots go to e2e-screens/, which is git-ignored)
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const SHOTS = process.argv.includes('--shots');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const ROUTES = [
  '/',
  '/app/',
  '/app/bandeja/',
  '/app/agenda/',
  '/app/pacientes/',
  '/app/pacientes/ficha/?id=P-0001',
  '/app/flujos/',
  '/app/flujos/editor/?id=F-REC',
  '/app/plantillas/',
  '/app/campanas/',
  '/app/metricas/',
  '/404',
].filter((r) => !ONLY || ONLY.split(',').some((o) => r === o || (o.endsWith('*') && r.startsWith(o.slice(0, -1)))));

const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' },
  { name: 'mobile', viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', isMobile: true, hasTouch: true },
  { name: 'reduced', viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' },
];

const server = await startServer(4621);
const browser = await chromium.launch();
const problems = [];
if (SHOTS) await mkdir(new URL('../e2e-screens/', import.meta.url), { recursive: true });

async function visit(profile, route, waitMs = 1800) {
  const ctx = await browser.newContext({
    viewport: profile.viewport,
    reducedMotion: profile.reducedMotion,
    isMobile: profile.isMobile ?? false,
    hasTouch: profile.hasTouch ?? false,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) log.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/404')) log.push(`http ${r.status()}: ${r.url()}`);
  });
  const res = await page.goto(server.url + route, { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const demo = await page.evaluate(() => [...document.querySelectorAll('.demo-mark')].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
  }));
  const status = res?.status() ?? 0;
  if (SHOTS) {
    const file = `${profile.name}${route.replace(/[^a-z0-9]+/gi, '_')}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(`../e2e-screens/${file}`, import.meta.url)) });
  }
  await ctx.close();
  const label = `[${profile.name}] ${route}`;
  if (status !== 200 && route !== '/404') problems.push(`${label}: HTTP ${status}`);
  if (overflow > 1) problems.push(`${label}: horizontal overflow ${overflow}px`);
  if (!demo) problems.push(`${label}: Demo mark not visible`);
  // The 404 page answers with HTTP 404 by design; Chromium logs that document status as a console error.
  const expected = (l) => route === '/404' && /status of 404/.test(l);
  const real = log.filter((l) => !expected(l));
  for (const l of real) problems.push(`${label}: ${l}`);
  console.log(`${real.length || overflow > 1 || !demo ? 'FAIL' : 'ok  '} ${label}`);
}

try {
  for (const profile of PROFILES) for (const route of ROUTES) await visit(profile, route);
  if (!ONLY) {
    await visit(PROFILES[0], '/?showcase', 6000);
    await visit(PROFILES[0], '/app/?showcase', 7000);
  }
} finally {
  await browser.close();
  await server.close();
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log('\nAll routes clean: no console errors or warnings, no overflow, Demo mark visible.');
