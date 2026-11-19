// Domain types shared by the seed data, the store, the simulation engine and every view.

export type SpecialtyId =
  | 'clinica'
  | 'pediatria'
  | 'cardiologia'
  | 'dermatologia'
  | 'ginecologia'
  | 'traumatologia'
  | 'oftalmologia'
  | 'odontologia'
  | 'nutricion'
  | 'psicologia'
  | 'kinesiologia'
  | 'otorrino';

export interface Specialty {
  id: SpecialtyId;
  name: string;
  short: string;
  /** Hue used for the specialty tag (oklch hue). */
  hue: number;
  keywords: string[];
}

export interface Professional {
  id: string;
  name: string;
  specialty: SpecialtyId;
  room: string;
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  age: number;
  insurance: string;
  specialty: SpecialtyId;
  tags: string[];
  notes: string;
  createdAt: number;
  lastContactAt: number;
}

export type AppointmentStatus =
  | 'pendiente'
  | 'recordado'
  | 'confirmado'
  | 'reprogramado'
  | 'cancelado'
  | 'atendido'
  | 'ausente';

export type ReplyPlan = 'confirma' | 'reprograma' | 'cancela' | 'silencio';

export interface Appointment {
  id: string;
  patientId: string;
  proId: string;
  /** Simulation minute (minutes since the demo week start). */
  start: number;
  duration: number;
  status: AppointmentStatus;
  remindedAt?: number;
  secondReminderAt?: number;
  replyAt?: number;
  plan?: ReplyPlan;
}

export type MessageFrom = 'paciente' | 'bot' | 'recepcion';

export interface Message {
  id: string;
  from: MessageFrom;
  text: string;
  at: number;
  quickReplies?: string[];
}

export type ConversationStatus = 'nueva' | 'derivada' | 'atencion' | 'resuelta';

export interface Conversation {
  id: string;
  patientId: string;
  specialty: SpecialtyId | null;
  proId: string | null;
  status: ConversationStatus;
  unread: number;
  updatedAt: number;
  topic: string;
  messages: Message[];
  firstResponseMinutes?: number;
  /** Minute when the inquiry automation processes the first message. */
  autoAt?: number;
  /** Minute when a person in reception answers (only when the automation is off). */
  manualAt?: number;
  /** Minute when the simulated patient answers a message sent from the inbox. */
  replyAt?: number;
}

export type NodeKind = 'trigger' | 'wait' | 'message' | 'condition' | 'action' | 'end';

export type TriggerType =
  | 'turno-proximo'
  | 'mensaje-recibido'
  | 'turno-cancelado'
  | 'turno-atendido'
  | 'manual';

export interface FlowNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  title: string;
  detail: string;
  /** trigger: trigger type; wait: hours; message: template id; condition: question; action: action key */
  value: string;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  branch?: 'si' | 'no';
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  trigger: TriggerType;
  active: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  runs: number;
  lastRunAt: number | null;
  createdAt: number;
}

export type TemplateCategory = 'recordatorio' | 'confirmacion' | 'respuesta' | 'encuesta' | 'campana';

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  body: string;
  quickReplies: string[];
  sent: number;
  replied: number;
  updatedAt: number;
}

export type CampaignStatus = 'borrador' | 'programada' | 'enviando' | 'pausada' | 'finalizada';

export interface Campaign {
  id: string;
  name: string;
  templateId: string;
  specialty: SpecialtyId | 'todas';
  audience: number;
  sent: number;
  replied: number;
  booked: number;
  status: CampaignStatus;
  createdAt: number;
  startAt: number | null;
}

export type ActivityKind =
  | 'mensaje'
  | 'recordatorio'
  | 'confirmacion'
  | 'reprogramacion'
  | 'cancelacion'
  | 'derivacion'
  | 'flujo'
  | 'campana'
  | 'atencion'
  | 'sistema';

export interface Activity {
  id: string;
  kind: ActivityKind;
  text: string;
  at: number;
  href?: string;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
  tone: 'info' | 'alerta' | 'ok';
  href?: string;
}

export interface DayStats {
  day: number;
  reminders: number;
  confirmations: number;
  reschedules: number;
  cancellations: number;
  inquiries: number;
  autoAnswered: number;
  responseMinutesTotal: number;
  responses: number;
}

export interface Kpis {
  remindersMonth: number;
  confirmationsMonth: number;
  answeredFastMonth: number;
  inquiriesMonth: number;
  hoursSavedMonth: number;
  messagesToday: number;
}

export type Speed = 1 | 4 | 10;

export interface SimSettings {
  paused: boolean;
  speed: Speed;
}

export interface AppState {
  version: number;
  seed: number;
  rng: number;
  clock: number;
  seq: number;
  sim: SimSettings;
  patients: Patient[];
  appointments: Appointment[];
  conversations: Conversation[];
  flows: Flow[];
  templates: Template[];
  campaigns: Campaign[];
  activity: Activity[];
  notices: Notice[];
  stats: DayStats[];
  kpis: Kpis;
  generatedDays: number;
}

/** Events emitted by the engine and the actions, used for live micro animations. */
export type SimEvent =
  | { type: 'tick'; clock: number }
  | { type: 'message'; convId: string; from: MessageFrom }
  | { type: 'appointment'; apptId: string; status: AppointmentStatus }
  | { type: 'flow-run'; flowId: string; path: string[]; edges: string[]; label: string }
  | { type: 'notice'; noticeId: string }
  | { type: 'activity'; activityId: string }
  | { type: 'campaign'; campaignId: string }
  | { type: 'kpi'; key: keyof Kpis }
  | { type: 'reset' };
