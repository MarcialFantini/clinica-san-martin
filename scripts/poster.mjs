// Captures public/poster.jpg (1600x900) from the real landing page in poster mode (`/?poster`):
// the hero with the agenda filling and reminders in flight.
// Usage: pnpm build && pnpm poster   (run `pnpm exec playwright install chromium` once)
// Serves the build in-process (DIST_DIR, default dist), so no dev or preview server is left running.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const out = fileURLToPath(new URL('../public/poster.jpg', import.meta.url));
const server = await startServer(4621);

try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/?poster`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('html[data-poster-ready="true"]', { timeout: 15000 });
  await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
  await browser.close();
  console.log(`Poster saved to ${out}`);
} finally {
  await server.close();
}
