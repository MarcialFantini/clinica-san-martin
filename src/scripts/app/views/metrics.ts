// Métricas: hand-drawn SVG charts with hover/focus tooltips and table equivalents, live.
import { SPECIALTIES } from '../../../data/catalog';
import { getState, subscribe } from '../../../lib/store';
import { dayLabel, dayOf, weekdayIndex } from '../../../lib/time';
import type { AppState, DayStats } from '../../../lib/types';
import { $, esc, fmt, tweenNumber } from '../dom';
import { totals } from './shared';

const C1 = '#236f9e';
const C2 = '#22a07f';
/** Reception's average first answer before the automation (sample figure for the demo). */
const MANUAL_MINUTES = 38;

function lastDays(s: AppState): DayStats[] {
  const today = dayOf(s.clock);
  return s.stats.filter((d) => d.day <= today && weekdayIndex(d.day) !== 0).slice(-7);
}

const rate = (d: { confirmations: number; reschedules: number; cancellations: number }) => {
  const base = d.confirmations + d.reschedules + d.cancellations;
  return base ? (d.confirmations / base) * 100 : 0;
};

export function mount(root: HTMLElement): () => void {
  const tip = $('[data-tip]', root)!;
  const daysChart = $('[data-chart="days"]', root)!;
  const rateChart = $('[data-chart="rate"]', root)!;
  const respChart = $('[data-chart="resp"]', root)!;
  const specChart = $('[data-chart="spec"]', root)!;
  const sigs: Record<string, string> = {};

  const once = (key: string, sig: string, fn: () => void) => {
    if (sigs[key] === sig) return;
    sigs[key] = sig;
    fn();
  };

  const render = (s: AppState) => {
    const days = lastDays(s);
    const today = dayOf(s.clock);
    const t = totals(days);
    tweenNumber($('[data-k="hours"]', root)!, Math.round(s.kpis.hoursSavedMonth));
    tweenNumber($('[data-k="rate"]', root)!, Math.round(rate(t)), { suffix: ' %' });
    tweenNumber($('[data-k="resp"]', root)!, t.responses ? t.responseMinutesTotal / t.responses : 0, { decimals: 1, suffix: ' min' });
    tweenNumber($('[data-k="saved"]', root)!, t.reschedules);

    // Chart 1: grouped bars.
    const wDays = Math.round(Math.max(320, daysChart.clientWidth || 760));
    once('days', JSON.stringify([wDays, days.map((d) => [d.day, d.reminders, d.confirmations])]), () => {
      const W = wDays;
      const H = W < 500 ? 220 : 260;
      const pad = { l: 40, r: 8, t: 12, b: 30 };
      const max = Math.max(10, ...days.map((d) => d.reminders));
      const nice = Math.ceil(max / 50) * 50;
      const iw = W - pad.l - pad.r;
      const ih = H - pad.t - pad.b;
      const gw = iw / Math.max(1, days.length);
      const bw = Math.min(28, (gw - 18) / 2);
      const y = (v: number) => pad.t + ih - (v / nice) * ih;
      const ticks = [0, nice / 2, nice];
      const bar = (x: number, v: number, c: string) => {
        const h = Math.max(0, pad.t + ih - y(v));
        const r = Math.min(4, h / 2, bw / 2);
        const top = y(v);
        // Rounded top, square base.
        return `<path class="bar" fill="${c}" d="M${x} ${pad.t + ih} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + bw - r} Q${x + bw} ${top} ${x + bw} ${top + r} V${pad.t + ih} Z"/>`;
      };
      const groups = days
        .map((d, i) => {
          const cx = pad.l + gw * i + gw / 2;
          const label = `${dayLabel(d.day, 'short')}: ${d.reminders} recordatorios, ${d.confirmations} confirmaciones`;
          return `<g tabindex="0" role="img" aria-label="${esc(label)}" class="${d.day === today ? 'today' : ''}" data-tip="${esc(`<b>${dayLabel(d.day, 'short')}${d.day === today ? ' (hoy)' : ''}</b><br><i style="background:${C1}"></i>Recordatorios ${fmt(d.reminders)}<br><i style="background:${C2}"></i>Confirmaciones ${fmt(d.confirmations)}`)}">
            <rect class="hit" x="${cx - gw / 2 + 4}" y="${pad.t}" width="${gw - 8}" height="${ih}" rx="6"/>
            ${bar(cx - bw - 1, d.reminders, C1)}${bar(cx + 1, d.confirmations, C2)}
            <text class="day" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(dayLabel(d.day, 'short'))}</text>
          </g>`;
        })
        .join('');
      const peak = days.reduce((a, d) => (d.reminders > (a?.reminders ?? -1) ? d : a), days[0]);
      const peakIdx = peak ? days.indexOf(peak) : -1;
      const peakLabel = peak && peakIdx >= 0 ? `<text class="label" x="${pad.l + gw * peakIdx + gw / 2 - bw / 2 - 1}" y="${y(peak.reminders) - 6}" text-anchor="middle">${fmt(peak.reminders)}</text>` : '';
      daysChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Recordatorios y confirmaciones de los últimos ${days.length} días">
        <g class="grid">${ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
        <g>${ticks.map((v) => `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('')}</g>
        ${groups}${peakLabel}</svg>`;
      $('[data-table="days"]', root)!.innerHTML = `<table class="table"><thead><tr><th scope="col">Día</th><th scope="col">Recordatorios</th><th scope="col">Confirmaciones</th><th scope="col">Reprogramados</th><th scope="col">Cancelados</th></tr></thead><tbody>${days
        .map((d) => `<tr><th scope="row">${esc(dayLabel(d.day, 'short'))}</th><td>${fmt(d.reminders)}</td><td>${fmt(d.confirmations)}</td><td>${fmt(d.reschedules)}</td><td>${fmt(d.cancellations)}</td></tr>`)
        .join('')}</tbody></table>`;
    });

    // Chart 2: confirmation rate line.
    const wRate = Math.round(Math.max(300, rateChart.clientWidth || 420));
    once('rate', JSON.stringify([wRate, days.map((d) => [d.day, Math.round(rate(d))])]), () => {
      const W = wRate;
      const H = 220;
      const pad = { l: 40, r: 16, t: 16, b: 30 };
      const iw = W - pad.l - pad.r;
      const ih = H - pad.t - pad.b;
      const pts = days.map((d, i) => ({ d, v: rate(d), x: pad.l + (days.length > 1 ? (iw * i) / (days.length - 1) : iw / 2) }));
      const y = (v: number) => pad.t + ih - ((v - 50) / 50) * ih;
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${y(Math.max(50, p.v))}`).join(' ');
      const last = pts[pts.length - 1];
      rateChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Tasa de confirmación diaria, entre 50 y 100 %">
        <g class="grid">${[50, 75, 100].map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
        ${[50, 75, 100].map((v) => `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v} %</text>`).join('')}
        <path class="line" d="${path}"/>
        ${pts
          .map(
            (p) => `<g tabindex="0" role="img" aria-label="${esc(`${dayLabel(p.d.day, 'short')}: ${Math.round(p.v)} %`)}" data-tip="${esc(`<b>${dayLabel(p.d.day, 'short')}</b><br>${Math.round(p.v)} % confirmó`)}" class="${p.d.day === today ? 'today' : ''}">
              <rect class="hit" x="${p.x - 18}" y="${pad.t}" width="36" height="${ih}" rx="6"/>
              <circle class="dot" cx="${p.x}" cy="${y(Math.max(50, p.v))}" r="5"/>
              <text class="day" x="${p.x}" y="${H - 8}" text-anchor="middle">${esc(dayLabel(p.d.day, 'short').split(' ')[0] ?? '')}</text></g>`,
          )
          .join('')}
        ${last ? `<text class="label" x="${last.x}" y="${y(Math.max(50, last.v)) - 12}" text-anchor="end">${Math.round(last.v)} %</text>` : ''}
      </svg>`;
      $('[data-table="rate"]', root)!.innerHTML = `<table class="table"><thead><tr><th scope="col">Día</th><th scope="col">Confirmación</th></tr></thead><tbody>${pts.map((p) => `<tr><th scope="row">${esc(dayLabel(p.d.day, 'short'))}</th><td>${Math.round(p.v)} %</td></tr>`).join('')}</tbody></table>`;
    });

    // Chart 3: response time, automated vs manual reference.
    const avg = t.responses ? t.responseMinutesTotal / t.responses : 0;
    once('resp', avg.toFixed(1), () => {
      respChart.innerHTML = `<div class="resp-compare">
        <div class="resp-row"><div class="resp-head"><span>Con Recepta</span><b>${fmt(avg, 1)} min</b></div><div class="track"><div class="fill" style="background:${C2};transform:scaleX(${Math.max(0.02, avg / MANUAL_MINUTES)})"></div></div></div>
        <div class="resp-row"><div class="resp-head"><span>Antes, a mano</span><b>${MANUAL_MINUTES} min</b></div><div class="track"><div class="fill" style="background:var(--ink-3);transform:scaleX(1)"></div></div></div>
        <p class="small muted">Promedio de los últimos 7 días. El valor manual es una referencia de ejemplo para la demo.</p>
      </div>`;
    });

    // Chart 4: open conversations by specialty.
    const counts = SPECIALTIES.map((sp) => ({ sp, n: s.conversations.filter((c) => c.specialty === sp.id).length })).sort((a, b) => b.n - a.n);
    const unclassified = s.conversations.filter((c) => c.specialty === null).length;
    once('spec', counts.map((c) => c.n).join(',') + unclassified, () => {
      const max = Math.max(1, ...counts.map((c) => c.n), unclassified);
      const rows = [...counts.map((c) => ({ name: c.sp.name, n: c.n })), { name: 'Para recepción', n: unclassified }];
      specChart.innerHTML = `<ul class="hbars" style="list-style:none;margin:0;padding:0">${rows
        .map((r) => `<li class="hbar"><span class="ellipsis">${esc(r.name)}</span><span class="track" aria-hidden="true"><span class="fill" style="display:block;transform:scaleX(${r.n / max})${r.name === 'Para recepción' ? ';background:var(--ink-3)' : ''}"></span></span><b>${r.n}</b></li>`)
        .join('')}</ul>`;
    });
  };

  // Tooltips: hover and keyboard focus show the same content.
  const show = (g: Element) => {
    const html = g.getAttribute('data-tip');
    if (!html) return;
    tip.innerHTML = html;
    tip.hidden = false;
    const r = g.getBoundingClientRect();
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.top = `${r.top + 12}px`;
  };
  const hide = () => {
    tip.hidden = true;
  };
  const onOver = (ev: Event) => {
    const g = (ev.target as Element).closest('[data-tip]:not(.m-tip)');
    if (g) show(g);
    else hide();
  };
  root.addEventListener('pointerover', onOver);
  root.addEventListener('focusin', onOver);
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });

  render(getState());
  const unsub = subscribe(render);
  let lastW = root.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(root.clientWidth - lastW) < 8) return;
    lastW = root.clientWidth;
    render(getState());
  });
  ro.observe(root);
  return () => {
    ro.disconnect();
    unsub();
    hide();
    root.removeEventListener('pointerover', onOver);
    root.removeEventListener('focusin', onOver);
    root.removeEventListener('pointerleave', hide);
    root.removeEventListener('focusout', hide);
    window.removeEventListener('scroll', hide);
  };
}
