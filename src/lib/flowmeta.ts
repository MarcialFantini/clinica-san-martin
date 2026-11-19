// Labels and options for flow nodes, shared by the list, the editor and the panel.
import type { IconName } from './icons';
import type { NodeKind, TriggerType } from './types';

export const KIND_META: Record<NodeKind, { label: string; icon: IconName; hue: string }> = {
  trigger: { label: 'Disparador', icon: 'bolt', hue: 'var(--petrol)' },
  wait: { label: 'Espera', icon: 'wait', hue: 'var(--amber)' },
  message: { label: 'Mensaje', icon: 'send', hue: 'var(--blue)' },
  condition: { label: 'Condición', icon: 'branch', hue: 'var(--aqua-ink)' },
  action: { label: 'Acción', icon: 'check', hue: '#5b6f9a' },
  end: { label: 'Fin', icon: 'stop', hue: 'var(--ink-3)' },
};

export const TRIGGERS: Record<TriggerType, string> = {
  'turno-proximo': 'Turno en las próximas 24 h',
  'mensaje-recibido': 'Mensaje recibido',
  'turno-cancelado': 'Turno cancelado',
  'turno-atendido': 'Consulta finalizada',
  manual: 'Inicio manual o campaña',
};

export const ACTIONS: Record<string, string> = {
  'actualizar-turno': 'Actualizar la agenda',
  'notificar-recepcion': 'Avisar a recepción',
  clasificar: 'Clasificar por especialidad',
  derivar: 'Derivar al profesional',
  'lista-espera': 'Buscar en lista de espera',
  'asignar-turno': 'Asignar el turno',
  etiquetar: 'Etiquetar al paciente',
};

export const CONDITIONS: Record<string, string> = {
  respondio: '¿Respondió el paciente?',
  especialidad: '¿Se reconoce la especialidad?',
  acepto: '¿Aceptó el turno ofrecido?',
  reservo: '¿Reservó un turno?',
};

export const NODE_W = 190;
export const NODE_H = 78;
