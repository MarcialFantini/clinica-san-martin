// Scene 1: canvas agenda of 40 professionals. An accelerated clock sweeps tomorrow's agenda;
// every booked slot whose hour passes sends a reminder bubble to its patient, who answers.
import { createRng } from '../../lib/rng';

const COLS = 24; // half hours from 08:00 to 20:00
const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const MIN_PER_SEC = 60; // one simulated hour per real second
const FORWARD_MIN_PER_SEC = 640;
const DAYS = ['lunes 16', 'martes 17', 'miércoles 18', 'jueves 19', 'viernes 20', 'sábado 21'];

const C_EMPTY = 'rgba(255,255,255,0.07)';
const C_BOOKED = '#2f7a8d';
const C_SENT = '#8bb9ec';
const C_OK = '#43c9aa';
const C_REPRO = '#e3a653';

interface Bubble {
  row: number;
  col: number;
  t0: number;
  dur: number;
}

export interface HeroController {
  forward(): void;
}

export function initHero(opts: { reduced: boolean; poster: boolean }): HeroController | null {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-hero-canvas]');
  const wrap = canvas?.parentElement;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !wrap || !ctx) return null;
  const timeEl = document.querySelector('[data-hero-time]');
  const dayEl = document.querySelector('[data-hero-day]');
  const statEls = {
    booked: document.querySelector('[data-stat="booked"]'),
    sent: document.querySelector('[data-stat="sent"]'),
    confirmed: document.querySelector('[data-stat="confirmed"]'),
  };
  const button = document.querySelector<HTMLButtonElement>('[data-hero-forward]');

  const rng = createRng(1116);
  const mq = window.matchMedia('(max-width: 720px)');
  let rows = mq.matches ? 20 : 40;
  let status = new Uint8Array(rows * COLS); // 0 empty, 1 booked, 2 sent, 3 confirmed, 4 rescheduled
  let replyAt = new Float64Array(rows * COLS);
  let pulse = new Float64Array(rows);
  let bubbles: Bubble[] = [];
  let clock = DAY_START;
  let day = 0;
  let forward = false;
  let holdUntil = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let visible = true;
  let raf = 0;
  let last = 0;
  let lastStats = 0;

  const colAt = (min: number) => Math.floor((min - DAY_START) / 30);

  function newDay(prefill: number): void {
    status = new Uint8Array(rows * COLS);
    replyAt = new Float64Array(rows * COLS);
    pulse = new Float64Array(rows);
    bubbles = [];
    for (let i = 0; i < status.length; i++) if (rng.chance(prefill)) status[i] = 1;
    clock = DAY_START;
  }

  function resolve(i: number): void {
    const r = rng.next();
    status[i] = r < 0.84 ? 3 : r < 0.93 ? 4 : 2;
    replyAt[i] = 0;
  }

  /** Runs the simulation without drawing (reduced motion and resizes). */
  function settleTo(min: number): void {
    const target = colAt(min);
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < Math.min(COLS, target); col++) {
        const i = row * COLS + col;
        if (status[i] === 1) resolve(i);
      }
    clock = min;
  }

  function resize(): void {
    const rect = wrap!.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas!.width = Math.round(width * dpr);
    canvas!.height = Math.round(height * dpr);
    const wantRows = mq.matches ? 20 : 40;
    if (wantRows !== rows) {
      rows = wantRows;
      const keep = clock;
      newDay(0.42);
      settleTo(keep);
    }
    draw(performance.now());
  }

  function geometry() {
    const top = 22;
    const patientsW = 34;
    const gridW = width - patientsW - 8;
    const cw = gridW / COLS;
    const ch = (height - top) / rows;
    return { top, gridW, cw, ch, px: width - patientsW / 2 };
  }

  function draw(now: number): void {
    const g = geometry();
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, width, height);
    // Cells
    const gap = Math.max(1, Math.min(2, g.ch * 0.18));
    const colors = [C_EMPTY, C_BOOKED, C_SENT, C_OK, C_REPRO];
    for (let row = 0; row < rows; row++) {
      const y = g.top + row * g.ch;
      for (let col = 0; col < COLS; col++) {
        ctx!.fillStyle = colors[status[row * COLS + col]!]!;
        ctx!.fillRect(col * g.cw + gap / 2, y + gap / 2, g.cw - gap, g.ch - gap);
      }
      // Patient dot with a pulse when a reminder lands
      const p = pulse[row]!;
      const age = now - p;
      const r = Math.max(2, Math.min(4, g.ch * 0.3));
      ctx!.fillStyle = p && age < 700 ? C_OK : 'rgba(255,255,255,0.28)';
      ctx!.beginPath();
      ctx!.arc(g.px, y + g.ch / 2, r, 0, Math.PI * 2);
      ctx!.fill();
      if (p && age < 700) {
        const k = age / 700;
        ctx!.strokeStyle = `rgba(67,201,170,${0.8 * (1 - k)})`;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(g.px, y + g.ch / 2, r + k * 10, 0, Math.PI * 2);
        ctx!.stroke();
      }
    }
    // Clock sweep
    if (clock > DAY_START && clock < DAY_END) {
      const x = ((clock - DAY_START) / 30) * g.cw;
      ctx!.fillStyle = 'rgba(67,201,170,0.9)';
      ctx!.fillRect(x - 1, g.top - 4, 2, height - g.top + 4);
    }
    // Reminder bubbles
    for (const b of bubbles) {
      const t = Math.min(1, Math.max(0, (now - b.t0) / b.dur));
      if (t <= 0) continue;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x0 = b.col * g.cw + g.cw / 2;
      const y0 = g.top + b.row * g.ch + g.ch / 2;
      const x1 = g.px;
      const y1 = y0;
      const cx = (x0 + x1) / 2;
      const cy = y0 - Math.min(90, 26 + (x1 - x0) * 0.22);
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x1;
      const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1;
      ctx!.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1;
      ctx!.fillStyle = '#ffffff';
      roundRect(x - 7, y - 5, 14, 10, 4);
      ctx!.fill();
      ctx!.fillStyle = C_OK;
      ctx!.fillRect(x - 4, y - 1.5, 8, 1.6);
      ctx!.fillRect(x - 4, y + 1.2, 5, 1.6);
      ctx!.globalAlpha = 1;
    }
    // Hour labels on a band above the grid, drawn last so bubbles never cover them
    ctx!.fillStyle = '#073846';
    ctx!.fillRect(0, 0, width, g.top - 4);
    ctx!.fillStyle = 'rgba(214,235,238,0.75)';
    ctx!.font = '600 11px "Commissioner", system-ui, sans-serif';
    ctx!.textBaseline = 'top';
    for (let h = 8; h <= 20; h += 2) {
      const x = ((h * 60 - DAY_START) / 30) * g.cw;
      ctx!.textAlign = h === 8 ? 'left' : h === 20 ? 'right' : 'center';
      ctx!.fillText(`${h} h`, Math.min(x, g.gridW), 2);
    }
    ctx!.textAlign = 'center';
    ctx!.fillText('Pac.', g.px, 2);
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    ctx!.beginPath();
    ctx!.moveTo(x + r, y);
    ctx!.arcTo(x + w, y, x + w, y + h, r);
    ctx!.arcTo(x + w, y + h, x, y + h, r);
    ctx!.arcTo(x, y + h, x, y, r);
    ctx!.arcTo(x, y, x + w, y, r);
    ctx!.closePath();
  }

  function updateText(): void {
    let booked = 0;
    let sent = 0;
    let ok = 0;
    for (const s of status) {
      if (s) booked++;
      if (s >= 2) sent++;
      if (s === 3) ok++;
    }
    const scale = 40 / rows; // the phone shows half the rows but counts the whole clinic
    const f = (n: number) => Math.round(n * scale).toLocaleString('es-AR');
    if (statEls.booked) statEls.booked.textContent = f(booked);
    if (statEls.sent) statEls.sent.textContent = f(sent);
    if (statEls.confirmed) statEls.confirmed.textContent = f(ok);
    const h = Math.min(DAY_END, Math.floor(clock));
    if (timeEl) timeEl.textContent = `${String(Math.floor(h / 60)).padStart(2, '0')}:${String(h % 60 - (h % 60) % 10).padStart(2, '0')}`;
    if (dayEl) dayEl.textContent = DAYS[day % DAYS.length] ?? '';
  }

  function step(now: number): void {
    const dt = Math.min(64, now - last);
    last = now;
    if (holdUntil) {
      if (now >= holdUntil) {
        holdUntil = 0;
        day++;
        newDay(0.38);
      }
    } else {
      const prevCol = colAt(clock);
      clock += (dt / 1000) * (forward ? FORWARD_MIN_PER_SEC : MIN_PER_SEC);
      // Bookings keep arriving for the rest of the day
      if (!forward && rng.chance(0.35)) {
        const col = Math.min(COLS - 1, colAt(clock) + 1 + rng.int(0, 10));
        const i = rng.int(0, rows - 1) * COLS + col;
        if (status[i] === 0) status[i] = 1;
      }
      const nowCol = Math.min(COLS, colAt(clock));
      for (let col = Math.max(0, prevCol); col < nowCol; col++) {
        for (let row = 0; row < rows; row++) {
          const i = row * COLS + col;
          if (status[i] !== 1) continue;
          status[i] = 2;
          const delay = rng.next() * (forward ? 900 : 500);
          const dur = 750 + rng.next() * 350;
          if (bubbles.length < 160) bubbles.push({ row, col, t0: now + delay, dur });
          replyAt[i] = now + delay + dur + 300 + rng.next() * 1500;
        }
      }
      if (clock >= DAY_END) {
        clock = DAY_END;
        forward = false;
        holdUntil = now + 1600;
      }
    }
    // Landings and replies
    bubbles = bubbles.filter((b) => {
      if (now - b.t0 >= b.dur) {
        pulse[b.row] = now;
        return false;
      }
      return true;
    });
    for (let i = 0; i < replyAt.length; i++) if (replyAt[i] && now >= replyAt[i]!) resolve(i);
    draw(now);
    if (now - lastStats > 200) {
      lastStats = now;
      updateText();
    }
  }

  let lastFrame = 0;
  function loop(now: number): void {
    raf = 0;
    if (!visible || document.hidden) return;
    // Phones draw at ~30 fps: the motion reads the same and the main thread stays free.
    if (!mq.matches || now - lastFrame >= 30) {
      lastFrame = now;
      step(now);
    }
    raf = requestAnimationFrame(loop);
  }

  function start(): void {
    if (opts.reduced || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  // Initial state
  newDay(0.42);
  if (opts.reduced) settleTo(14 * 60 + 30);
  else if (opts.poster) settleTo(10 * 60 + 40);
  resize();
  updateText();

  new ResizeObserver(() => resize()).observe(wrap);
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) start();
  }).observe(wrap);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) start();
  });

  const controller: HeroController = {
    forward() {
      if (opts.reduced) {
        day++;
        newDay(0.42);
        settleTo(DAY_END);
        draw(performance.now());
        updateText();
        return;
      }
      if (holdUntil) {
        holdUntil = 0;
        day++;
        newDay(0.42);
      }
      forward = true;
      start();
    },
  };
  button?.addEventListener('click', () => controller.forward());
  start();
  return controller;
}
