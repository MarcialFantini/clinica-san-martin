// Fixed content for the landing scenes (shared by the Astro markup and the client scripts).
import { PROFESSIONALS, SPECIALTIES } from '../../data/catalog';
import type { SpecialtyId } from '../../lib/types';

export interface Lane {
  id: SpecialtyId | 'recepcion';
  name: string;
  short: string;
  hue: number;
  pro: string;
}

export const LANES: Lane[] = [
  ...SPECIALTIES.map((s) => ({
    id: s.id,
    name: s.name,
    short: s.short,
    hue: s.hue,
    pro: PROFESSIONALS.find((p) => p.specialty === s.id)?.name ?? '',
  })),
  { id: 'recepcion', name: 'Recepción', short: 'Recepción', hue: 20, pro: 'Atiende una persona' },
];

export interface InboxMessage {
  name: string;
  text: string;
  lane: Lane['id'];
}

/** The four messages already routed when the scene appears. */
export const INITIAL_MESSAGES: InboxMessage[] = [
  { name: 'Graciela Ríos', text: 'Tengo un lunar que cambió de color, quisiera que lo vean', lane: 'dermatologia' },
  { name: 'Mateo Funes', text: 'Mi hijo tiene fiebre, ¿hay pediatra mañana?', lane: 'pediatria' },
  { name: 'Norma Ledesma', text: '¿Aceptan mi obra social?', lane: 'recepcion' },
  { name: 'Federico Paz', text: 'Me pidieron un electro y control con cardiólogo', lane: 'cardiologia' },
];

export const INITIAL_COUNTS: Partial<Record<Lane['id'], number>> = {
  clinica: 14, pediatria: 9, cardiologia: 6, dermatologia: 7, ginecologia: 8, traumatologia: 11,
  oftalmologia: 5, odontologia: 10, nutricion: 3, psicologia: 4, kinesiologia: 3, otorrino: 2, recepcion: 6,
};

export type FlowKind = 'trigger' | 'wait' | 'message' | 'condition' | 'action';

export interface LandingNode {
  id: string;
  kind: FlowKind;
  kindLabel: string;
  title: string;
  detail: string;
}

export const FLOW_NODES: LandingNode[] = [
  { id: 't', kind: 'trigger', kindLabel: 'Disparador', title: 'Turno reservado', detail: 'Cada turno nuevo' },
  { id: 'w', kind: 'wait', kindLabel: 'Espera', title: 'Hasta 24 h antes', detail: 'Del horario del turno' },
  { id: 'm', kind: 'message', kindLabel: 'Mensaje', title: 'Recordatorio', detail: 'Con Confirmo y Reprogramo' },
  { id: 'c', kind: 'condition', kindLabel: 'Condición', title: '¿Respondió?', detail: 'Espera hasta 3 h' },
  { id: 'y', kind: 'action', kindLabel: 'Acción', title: 'Actualizar agenda', detail: 'Confirma o reprograma' },
  { id: 'n', kind: 'message', kindLabel: 'Mensaje', title: 'Segundo aviso', detail: '3 h antes del turno' },
  { id: 'r', kind: 'action', kindLabel: 'Acción', title: 'Avisar a recepción', detail: 'Si sigue sin respuesta' },
];

export const FLOW_EDGES: Array<{ id: string; from: string; to: string; label?: string }> = [
  { id: 'e1', from: 't', to: 'w' },
  { id: 'e2', from: 'w', to: 'm' },
  { id: 'e3', from: 'm', to: 'c' },
  { id: 'e4', from: 'c', to: 'y', label: 'Sí' },
  { id: 'e5', from: 'c', to: 'n', label: 'No' },
  { id: 'e6', from: 'n', to: 'r' },
];

export interface FlowLayout {
  width: number;
  height: number;
  nodeW: number;
  nodeH: number;
  pos: Record<string, { x: number; y: number }>;
}

export const FLOW_DESKTOP: FlowLayout = {
  width: 1280,
  height: 400,
  nodeW: 184,
  nodeH: 80,
  pos: {
    t: { x: 10, y: 160 }, w: { x: 222, y: 160 }, m: { x: 434, y: 160 }, c: { x: 646, y: 160 },
    y: { x: 866, y: 40 }, n: { x: 866, y: 280 }, r: { x: 1084, y: 280 },
  },
};

export const FLOW_MOBILE: FlowLayout = {
  width: 360,
  height: 690,
  nodeW: 164,
  nodeH: 78,
  pos: {
    t: { x: 98, y: 8 }, w: { x: 98, y: 120 }, m: { x: 98, y: 232 }, c: { x: 98, y: 344 },
    y: { x: 6, y: 476 }, n: { x: 190, y: 476 }, r: { x: 190, y: 600 },
  },
};

/** Cubic path between two nodes: horizontal ports when they sit side by side, vertical otherwise. */
export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, w: number, h: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy) * 0.9) {
    const dir = dx >= 0 ? 1 : -1;
    const x1 = dir > 0 ? a.x + w : a.x;
    const x2 = dir > 0 ? b.x : b.x + w;
    const y1 = a.y + h / 2;
    const y2 = b.y + h / 2;
    const k = Math.max(30, Math.abs(x2 - x1) / 2);
    return `M${x1} ${y1} C${x1 + k * dir} ${y1} ${x2 - k * dir} ${y2} ${x2} ${y2}`;
  }
  const dir = dy >= 0 ? 1 : -1;
  const x1 = a.x + w / 2;
  const x2 = b.x + w / 2;
  const y1 = dir > 0 ? a.y + h : a.y;
  const y2 = dir > 0 ? b.y : b.y + h;
  const k = Math.max(24, Math.abs(y2 - y1) / 2);
  return `M${x1} ${y1} C${x1} ${y1 + k * dir} ${x2} ${y2 - k * dir} ${x2} ${y2}`;
}

export interface TimelineBlock {
  from: number;
  to: number;
  label: string;
  tone: 'phone' | 'manual' | 'desk' | 'gap' | 'free' | 'review';
}

export const DAY_BEFORE: TimelineBlock[] = [
  { from: 8, to: 9.5, label: 'Llamar para confirmar los turnos de hoy', tone: 'phone' },
  { from: 9.5, to: 11, label: 'Mostrador y teléfono a la vez', tone: 'desk' },
  { from: 11, to: 12, label: 'Responder mensajes uno por uno', tone: 'manual' },
  { from: 12, to: 13, label: 'Reacomodar ausencias', tone: 'manual' },
  { from: 13, to: 14, label: 'Consultas sin responder', tone: 'gap' },
  { from: 14, to: 16, label: 'Llamar para confirmar los turnos de mañana', tone: 'phone' },
  { from: 16, to: 17.5, label: 'Mostrador', tone: 'desk' },
  { from: 17.5, to: 19, label: 'Mensajes atrasados', tone: 'manual' },
  { from: 19, to: 20, label: 'Cargar cambios en la agenda', tone: 'manual' },
];

export const DAY_AFTER: TimelineBlock[] = [
  { from: 8, to: 9, label: 'Revisar el resumen de la noche', tone: 'review' },
  { from: 9, to: 12, label: 'Atender en el mostrador', tone: 'desk' },
  { from: 12, to: 13, label: 'Resolver 5 casos derivados', tone: 'review' },
  { from: 13, to: 16, label: 'Atender en el mostrador', tone: 'desk' },
  { from: 16, to: 17.5, label: 'Facturación y obras sociales', tone: 'free' },
  { from: 17.5, to: 20, label: 'Atender en el mostrador', tone: 'desk' },
];

export const CHAT_PATIENTS = [
  { name: 'Lucía', specialty: 'Cardiología', pro: 'Dra. Paula Ríos', when: 'jueves 19 a las 10:30', next: 'viernes 20 a las 11:00' },
  { name: 'Martín', specialty: 'Traumatología', pro: 'Dr. Diego Acosta', when: 'jueves 19 a las 16:00', next: 'lunes 23 a las 15:30' },
  { name: 'Graciela', specialty: 'Oftalmología', pro: 'Dra. Carolina Vega', when: 'jueves 19 a las 9:00', next: 'martes 24 a las 9:30' },
  { name: 'Tomás', specialty: 'Odontología', pro: 'Dr. Matías Luna', when: 'jueves 19 a las 18:30', next: 'miércoles 25 a las 18:00' },
  { name: 'Silvia', specialty: 'Ginecología', pro: 'Dra. Romina Peralta', when: 'jueves 19 a las 11:30', next: 'viernes 20 a las 12:00' },
];
