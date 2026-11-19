import type { IconName } from './icons';

export type ViewId = 'panel' | 'bandeja' | 'pacientes' | 'ficha' | 'agenda' | 'flujos' | 'editor' | 'plantillas' | 'campanas' | 'metricas';

export interface NavItem {
  view: ViewId;
  href: string;
  label: string;
  icon: IconName;
  key: string;
  /** Views that highlight this item (detail pages). */
  also?: ViewId[];
}

export const NAV: NavItem[] = [
  { view: 'panel', href: '/app/', label: 'Inicio', icon: 'home', key: 'i' },
  { view: 'bandeja', href: '/app/bandeja/', label: 'Bandeja', icon: 'inbox', key: 'b' },
  { view: 'agenda', href: '/app/agenda/', label: 'Agenda', icon: 'calendar', key: 'a' },
  { view: 'pacientes', href: '/app/pacientes/', label: 'Pacientes', icon: 'users', key: 'p', also: ['ficha'] },
  { view: 'flujos', href: '/app/flujos/', label: 'Automatizaciones', icon: 'flow', key: 'f', also: ['editor'] },
  { view: 'plantillas', href: '/app/plantillas/', label: 'Plantillas', icon: 'template', key: 't' },
  { view: 'campanas', href: '/app/campanas/', label: 'Campañas', icon: 'megaphone', key: 'c' },
  { view: 'metricas', href: '/app/metricas/', label: 'Métricas', icon: 'chart', key: 'm' },
];

export function isActive(item: NavItem, view: string): boolean {
  return item.view === view || (item.also?.includes(view as ViewId) ?? false);
}
