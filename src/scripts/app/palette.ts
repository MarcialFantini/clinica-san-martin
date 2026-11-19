// Command palette (Ctrl/Cmd+K): views, actions, patients and automations in one list.
import { navigate } from 'astro:transitions/client';
import { normalize } from '../../lib/classify';
import { icon, type IconName } from '../../lib/icons';
import { NAV } from '../../lib/nav';
import { getState } from '../../lib/store';
import { $, esc } from './dom';

interface Command {
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
}

interface Actions {
  togglePause: () => void;
  cycleSpeed: () => void;
  advanceHour: (h?: number) => void;
  askReset: () => void;
  openHelp: () => void;
}

let actions: Actions;
let selected = 0;
let current: Command[] = [];

function baseCommands(): Command[] {
  const s = getState();
  const go = (href: string) => () => void navigate(href);
  return [
    ...NAV.map((n) => ({ group: 'Ir a', label: n.label, hint: `G ${n.key.toUpperCase()}`, icon: n.icon, run: go(n.href) })),
    { group: 'Acciones', label: s.sim.paused ? 'Reanudar simulación' : 'Pausar simulación', hint: 'P', icon: s.sim.paused ? 'play' : 'pause', run: actions.togglePause },
    { group: 'Acciones', label: 'Cambiar velocidad (1x, 4x, 10x)', hint: 'S', icon: 'bolt', run: actions.cycleSpeed },
    { group: 'Acciones', label: 'Adelantar el reloj 1 hora', hint: '+', icon: 'forward', run: () => actions.advanceHour(1) },
    { group: 'Acciones', label: 'Adelantar 24 horas (ver salir los recordatorios)', icon: 'forward', run: () => actions.advanceHour(24) },
    { group: 'Acciones', label: 'Simular un paciente que escribe', icon: 'send', run: go('/app/bandeja/?simular=1') },
    { group: 'Acciones', label: 'Crear una automatización', icon: 'plus', run: go('/app/flujos/editor/?nuevo=1') },
    { group: 'Acciones', label: 'Crear una campaña', icon: 'megaphone', run: go('/app/campanas/?nueva=1') },
    { group: 'Acciones', label: 'Ver atajos de teclado', hint: '?', icon: 'keyboard', run: actions.openHelp },
    { group: 'Acciones', label: 'Reiniciar demo', icon: 'reset', run: actions.askReset },
    ...s.flows.map((f) => ({ group: 'Automatizaciones', label: f.name, hint: f.active ? 'Activa' : 'Pausada', icon: 'flow' as IconName, run: go(`/app/flujos/editor/?id=${f.id}`) })),
  ];
}

function search(q: string): Command[] {
  const nq = normalize(q).trim();
  const base = baseCommands();
  if (!nq) return base.filter((c) => c.group !== 'Automatizaciones');
  const words = nq.split(/\s+/);
  const match = (text: string) => {
    const t = normalize(text);
    return words.every((w) => t.includes(w));
  };
  const patients = getState()
    .patients.filter((p) => match(`${p.name} ${p.phone} ${p.id}`))
    .slice(0, 6)
    .map((p) => ({ group: 'Pacientes', label: p.name, hint: p.phone, icon: 'users' as IconName, run: () => void navigate(`/app/pacientes/ficha/?id=${p.id}`) }));
  return [...base.filter((c) => match(`${c.label} ${c.group}`)), ...patients];
}

function render(): void {
  const list = $('#palette-list');
  if (!list) return;
  if (!current.length) {
    list.innerHTML = '<li class="empty">Sin resultados.</li>';
    return;
  }
  let group = '';
  let html = '';
  current.forEach((c, i) => {
    if (c.group !== group) {
      group = c.group;
      html += `<li class="palette-group" role="presentation">${esc(group)}</li>`;
    }
    html += `<li class="palette-item" role="option" id="pal-${i}" data-index="${i}" aria-selected="${i === selected}">${icon(c.icon)}<span>${esc(c.label)}</span>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</li>`;
  });
  list.innerHTML = html;
  $('#palette input')?.setAttribute('aria-activedescendant', `pal-${selected}`);
  $(`#pal-${selected}`)?.scrollIntoView({ block: 'nearest' });
}

function run(i: number): void {
  const c = current[i];
  if (!c) return;
  $<HTMLDialogElement>('#palette')?.close();
  c.run();
}

export function openPalette(): void {
  const dialog = $<HTMLDialogElement>('#palette');
  const input = $<HTMLInputElement>('#palette input');
  if (!dialog || !input || dialog.open) return;
  input.value = '';
  selected = 0;
  current = search('');
  render();
  dialog.showModal();
  input.focus();
}

export function initPalette(a: Actions): void {
  actions = a;
  const input = $<HTMLInputElement>('#palette input');
  const list = $('#palette-list');
  input?.addEventListener('input', () => {
    selected = 0;
    current = search(input.value);
    render();
  });
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      selected = Math.min(current.length - 1, selected + 1);
      render();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      selected = Math.max(0, selected - 1);
      render();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      run(selected);
    }
  });
  list?.addEventListener('click', (ev) => {
    const item = (ev.target as Element).closest<HTMLElement>('[data-index]');
    if (item) run(Number(item.dataset.index));
  });
  list?.addEventListener('mousemove', (ev) => {
    const item = (ev.target as Element).closest<HTMLElement>('[data-index]');
    const i = Number(item?.dataset.index ?? -1);
    if (item && i !== selected) {
      selected = i;
      for (const el of list.querySelectorAll('[aria-selected="true"]')) el.setAttribute('aria-selected', 'false');
      item.setAttribute('aria-selected', 'true');
      input?.setAttribute('aria-activedescendant', item.id);
    }
  });
}
