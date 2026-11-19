// Interaction tests against the built site (run `pnpm build` first).
// Drives the real UI: palette, shortcuts, live engine at 10x across client-side navigations,
// flow editor (add, keyboard move, wire, run), agenda drawer, templates, campaigns, simulate patient,
// reset, and the showcase guarantee (never touches the saved session).
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const server = await startServer(4621);
const browser = await chromium.launch();
const failures = [];
const errors = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

async function newPage(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    // The 404 page answers with HTTP 404 by design; Chromium logs that document status.
    const expected = page.url().endsWith('/404') && m.text().includes('status of 404');
    if (['error', 'warning'].includes(m.type()) && !expected) errors.push(`${page.url()} ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${page.url()} pageerror: ${e.message}`));
  return { ctx, page };
}

const clockText = (page) => page.locator('.topbar [data-clock]').innerText();

try {
  const { ctx, page } = await newPage();
  await page.goto(`${server.url}/app/`);
  await page.waitForSelector('[data-view-root][data-ready]');

  // Live clock ticks at 1x, then pause stops it.
  const c0 = await clockText(page);
  await page.waitForTimeout(2300);
  const c1 = await clockText(page);
  check('clock ticks live', c0 !== c1, `${c0} -> ${c1}`);
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  const p0 = await clockText(page);
  await page.waitForTimeout(1500);
  check('pause with P stops the clock', p0 === (await clockText(page)));
  check('live label shows PAUSA', (await page.locator('[data-live-label]').first().innerText()) === 'PAUSA');
  await page.keyboard.press('p');

  // Speed 10x.
  await page.click('.topbar [data-speed="10"]');
  await page.waitForTimeout(200);
  check('10x pressed', (await page.getAttribute('.topbar [data-speed="10"]', 'aria-pressed')) === 'true');

  // Help dialog.
  await page.keyboard.press('?');
  check('? opens help', await page.locator('#help').evaluate((d) => d.open));
  await page.keyboard.press('Escape');

  // Palette navigation.
  await page.keyboard.press('Control+k');
  check('Ctrl+K opens palette', await page.locator('#palette').evaluate((d) => d.open));
  await page.keyboard.type('metricas');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/app/metricas/');
  await page.waitForSelector('[data-chart="days"] svg');
  check('palette navigates to Métricas', true);

  // g-shortcuts across views while the engine runs at 10x.
  for (const [key, path] of [['b', 'bandeja'], ['a', 'agenda'], ['f', 'flujos'], ['t', 'plantillas'], ['c', 'campanas'], ['p', 'pacientes'], ['i', '']]) {
    await page.keyboard.press('g');
    await page.keyboard.press(key);
    await page.waitForURL(`**/app/${path ? `${path}/` : ''}`);
    await page.waitForTimeout(1200);
  }
  check('g-shortcuts navigate through every view at 10x', true);
  const feedCount = await page.locator('[data-slot="feed"] li').count();
  check('activity feed is live', feedCount > 4, `${feedCount} items`);

  // Notifications panel.
  await page.keyboard.press('n');
  check('N opens notifications', await page.locator('#notif-panel').evaluate((el) => el.classList.contains('open')));
  await page.keyboard.press('Escape');

  // Flow editor: add node, move with keyboard, wire with pointer, run.
  await page.keyboard.press('p'); // pause to make the editor deterministic
  await page.goto(`${server.url}/app/flujos/editor/?id=F-POST`);
  await page.waitForSelector('[data-node="n4"]');
  const before = await page.locator('[data-node]').count();
  await page.click('[data-node="n3"]');
  await page.click('[data-add="action"]');
  const after = await page.locator('[data-node]').count();
  check('editor adds a node', after === before + 1, `${before} -> ${after}`);
  const newId = await page.evaluate(() => document.activeElement?.getAttribute('data-node'));
  const t0 = await page.locator(`[data-node="${newId}"]`).evaluate((el) => el.style.transform);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(250);
  const t1 = await page.locator(`[data-node="${newId}"]`).evaluate((el) => el.style.transform);
  check('arrow keys move the node', t0 !== t1, `${t0} -> ${t1}`);
  const edgesBefore = await page.locator('path.edge').count();
  const port = await page.locator(`[data-node="${newId}"] [data-port]`).boundingBox();
  const target = await page.locator('[data-node="n4"]').boundingBox();
  if (port && target) {
    await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 40, target.y + 30, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForTimeout(200);
  check('dragging a port wires two nodes', (await page.locator('path.edge').count()) === edgesBefore + 1);
  const nb = await page.locator('[data-node="n2"]').boundingBox();
  const tb0 = await page.locator('[data-node="n2"]').evaluate((el) => el.style.transform);
  if (nb) {
    await page.mouse.move(nb.x + 100, nb.y + 40);
    await page.mouse.down();
    await page.mouse.move(nb.x + 100, nb.y + 140, { steps: 6 });
    await page.mouse.up();
  }
  check('dragging moves a node', tb0 !== (await page.locator('[data-node="n2"]').evaluate((el) => el.style.transform)));
  await page.click('[data-run]');
  await page.waitForTimeout(250);
  check('run lights up a node', (await page.locator('.fe-node.active').count()) === 1);
  await page.waitForFunction(() => document.querySelector('[data-run-label]')?.textContent === 'Ejecutar paso a paso', null, { timeout: 15000 });
  check('run finishes and logs steps', (await page.locator('[data-log] li').count()) >= 4);
  await page.reload();
  await page.waitForSelector('[data-node]');
  check('editor changes persist after reload', (await page.locator('[data-node]').count()) === after);

  // Agenda drawer: confirm an appointment.
  await page.goto(`${server.url}/app/agenda/?dia=1`);
  await page.waitForSelector('.g-appt.recordado, .g-appt.pendiente');
  await page.locator('.g-appt.pendiente, .g-appt.recordado').first().click();
  check('agenda drawer opens', await page.locator('[data-drawer]').evaluate((el) => el.classList.contains('open')));
  await page.click('[data-do="confirmar"]');
  await page.waitForTimeout(300);
  check('drawer action confirms the appointment', (await page.locator('[data-drawer-body] .status').innerText()).includes('Confirmado'));
  await page.keyboard.press('Escape');

  // Templates: editing updates the preview.
  await page.goto(`${server.url}/app/plantillas/?id=T-CONF`);
  await page.fill('#tpl-body', 'Listo {{nombre}}, te esperamos.');
  await page.waitForTimeout(600);
  check('template preview follows the editor', (await page.locator('[data-preview]').innerText()).includes('Listo Lucía'));

  // Campaign creation.
  await page.goto(`${server.url}/app/campanas/?nueva=1`);
  await page.fill('#nc-name', 'Prueba e2e');
  await page.click('[data-form] button[type="submit"]');
  await page.waitForTimeout(300);
  check('new campaign appears', (await page.locator('.camp h2', { hasText: 'Prueba e2e' }).count()) === 1);

  // Simulate patient: classified and routed.
  await page.goto(`${server.url}/app/bandeja/?simular=1`);
  await page.fill('#sim-text', 'Me duele mucho la rodilla');
  await page.click('[data-sim-form] button[type="submit"]');
  await page.waitForSelector('.sys-note', { timeout: 5000 });
  check('simulated patient is routed to Traumatología', (await page.locator('.sys-note').innerText()).includes('Traumatología'));

  // Reset demo.
  await page.click('.sidebar [data-action="reset"]');
  await page.click('[data-action="reset-confirm"]');
  await page.waitForTimeout(400);
  check('reset returns the clock to Monday 09:12', (await clockText(page)).includes('09:1'));
  await ctx.close();

  // Showcase never writes the visitor's session.
  const { ctx: c2, page: p2 } = await newPage();
  await p2.goto(`${server.url}/app/`);
  await p2.waitForSelector('[data-view-root][data-ready]');
  // Seed the saved session from a page that does not run the app, so nothing else writes it.
  await p2.goto(`${server.url}/404`);
  await p2.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('csm-recepta-state') ?? 'null');
    s.flows[0].name = 'Marca del visitante';
    localStorage.setItem('csm-recepta-state', JSON.stringify(s));
  });
  await p2.goto(`${server.url}/app/?showcase`);
  await p2.waitForTimeout(6000);
  const kept = await p2.evaluate(() => JSON.parse(localStorage.getItem('csm-recepta-state') ?? '{}').flows?.[0]?.name);
  check('showcase keeps the saved session intact', kept === 'Marca del visitante', String(kept));
  await c2.close();

  // Reduced motion: simulation starts paused.
  const ctx3 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const p3 = await ctx3.newPage();
  await p3.goto(`${server.url}/app/`);
  await p3.waitForSelector('[data-view-root][data-ready]');
  check('reduced motion starts paused', (await p3.locator('[data-live-label]').first().innerText()) === 'PAUSA');
  await ctx3.close();
} finally {
  await browser.close();
  await server.close();
}

if (errors.length) {
  console.log('\nConsole problems:');
  for (const e of errors) console.log(` - ${e}`);
}
if (failures.length || errors.length) process.exit(1);
console.log('\nAll interactions pass with a clean console.');
