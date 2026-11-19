// State operations shared by the simulation engine and the user actions.
// Each one mutates the state in place and returns the events it produced.
import { PRO_BY_ID, PROFESSIONALS, SPECIALTY_BY_ID } from '../data/catalog';
import { statsFor } from '../data/seed';
import { classify } from './classify';
import { fillTemplate, varsFor } from './templating';
import { dayOf, hhmm } from './time';
import type {
  Activity, AppState, Appointment, Conversation, Flow, FlowNode, Message, Notice, Patient, SimEvent, SpecialtyId, TriggerType,
} from './types';

const ACTIVITY_CAP = 60;
const NOTICE_CAP = 40;
const CONVERSATION_CAP = 90;
const MESSAGE_CAP = 16;

export function nextId(state: AppState, prefix: string): string {
  state.seq++;
  return `${prefix}-${state.seq}`;
}

export function patientById(state: AppState, id: string): Patient | undefined {
  return state.patients.find((p) => p.id === id);
}

export function addActivity(state: AppState, kind: Activity['kind'], text: string, href?: string): SimEvent {
  const item: Activity = href ? { id: nextId(state, 'ACT'), kind, text, at: state.clock, href } : { id: nextId(state, 'ACT'), kind, text, at: state.clock };
  state.activity.unshift(item);
  if (state.activity.length > ACTIVITY_CAP) state.activity.length = ACTIVITY_CAP;
  return { type: 'activity', activityId: item.id };
}

export function addNotice(state: AppState, title: string, body: string, tone: Notice['tone'], href?: string): SimEvent {
  const n: Notice = { id: nextId(state, 'N'), title, body, at: state.clock, read: false, tone };
  if (href) n.href = href;
  state.notices.unshift(n);
  if (state.notices.length > NOTICE_CAP) state.notices.length = NOTICE_CAP;
  return { type: 'notice', noticeId: n.id };
}

export function makeMessage(state: AppState, from: Message['from'], text: string, quickReplies?: string[]): Message {
  const m: Message = { id: nextId(state, 'M'), from, text, at: state.clock };
  if (quickReplies && quickReplies.length) m.quickReplies = quickReplies;
  return m;
}

export function pushMessage(state: AppState, conv: Conversation, message: Message): SimEvent {
  conv.messages.push(message);
  if (conv.messages.length > MESSAGE_CAP) conv.messages.splice(0, conv.messages.length - MESSAGE_CAP);
  conv.updatedAt = state.clock;
  if (message.from === 'paciente') {
    conv.unread += 1;
    const p = patientById(state, conv.patientId);
    if (p) p.lastContactAt = state.clock;
  }
  state.kpis.messagesToday += 1;
  // Most recent first.
  const i = state.conversations.indexOf(conv);
  if (i > 0) {
    state.conversations.splice(i, 1);
    state.conversations.unshift(conv);
  }
  return { type: 'message', convId: conv.id, from: message.from };
}

export function newConversation(state: AppState, patientId: string, topic: string, specialty: SpecialtyId | null): Conversation {
  const conv: Conversation = {
    id: nextId(state, 'CV'), patientId, specialty, proId: null, status: 'nueva', unread: 0, updatedAt: state.clock, topic, messages: [],
  };
  state.conversations.unshift(conv);
  if (state.conversations.length > CONVERSATION_CAP) {
    const idx = state.conversations.map((c, j) => ({ c, j })).reverse().find(({ c }) => c.status === 'resuelta');
    state.conversations.splice(idx ? idx.j : state.conversations.length - 1, 1);
  }
  return conv;
}

/** Latest conversation of a patient touched in the last 2 days, or a new one. */
export function conversationFor(state: AppState, patientId: string, topic: string, specialty: SpecialtyId | null): Conversation {
  const existing = state.conversations.find((c) => c.patientId === patientId && state.clock - c.updatedAt < 2 * 24 * 60);
  if (existing) {
    existing.topic = topic;
    if (specialty) existing.specialty = specialty;
    return existing;
  }
  return newConversation(state, patientId, topic, specialty);
}

export function flowFor(state: AppState, trigger: TriggerType): Flow | undefined {
  return state.flows.find((f) => f.trigger === trigger && f.active);
}

export interface Walk {
  path: string[];
  edges: string[];
}

/** Follows the flow graph from its trigger. Conditions take the branch `decide` returns. */
export function walkFlow(flow: Flow, decide: (n: FlowNode) => 'si' | 'no'): Walk {
  const start = flow.nodes.find((n) => n.kind === 'trigger') ?? flow.nodes[0];
  const path: string[] = [];
  const edges: string[] = [];
  const seen = new Set<string>();
  let cur: FlowNode | undefined = start;
  while (cur && path.length < 16) {
    path.push(cur.id);
    seen.add(cur.id);
    const outs = flow.edges.filter((e) => e.from === cur?.id);
    if (!outs.length) break;
    let edge = outs[0];
    if (cur.kind === 'condition') {
      const branch = decide(cur);
      edge = outs.find((e) => e.branch === branch) ?? outs.find((e) => !e.branch) ?? outs[0];
    }
    if (!edge || seen.has(edge.to)) break;
    edges.push(edge.id);
    const toId: string = edge.to;
    cur = flow.nodes.find((n) => n.id === toId);
  }
  return { path, edges };
}

/** Records a flow execution and returns the event that animates it. */
export function runFlow(state: AppState, flow: Flow, decide: (n: FlowNode) => 'si' | 'no', label: string): SimEvent {
  const walk = walkFlow(flow, decide);
  flow.runs += 1;
  flow.lastRunAt = state.clock;
  return { type: 'flow-run', flowId: flow.id, path: walk.path, edges: walk.edges, label };
}

/** Template used by the first message node of a flow (so editing the flow changes the message). */
export function flowTemplate(state: AppState, flow: Flow | undefined, fallback: string) {
  const nodeTpl = flow?.nodes.find((n) => n.kind === 'message')?.value;
  return state.templates.find((t) => t.id === nodeTpl) ?? state.templates.find((t) => t.id === fallback);
}

export function sendTemplate(state: AppState, conv: Conversation, templateId: string, patient: Patient | undefined, appt?: Appointment): SimEvent | null {
  const tpl = state.templates.find((t) => t.id === templateId);
  if (!tpl) return null;
  tpl.sent += 1;
  state.kpis.hoursSavedMonth += 2.5 / 60;
  return pushMessage(state, conv, makeMessage(state, 'bot', fillTemplate(tpl.body, varsFor(patient, appt)), tpl.quickReplies));
}

export function leastLoadedPro(state: AppState, specialty: SpecialtyId): string {
  const pros = PROFESSIONALS.filter((p) => p.specialty === specialty);
  const load = new Map(pros.map((p) => [p.id, 0]));
  for (const c of state.conversations) if (c.proId && load.has(c.proId) && c.status !== 'resuelta') load.set(c.proId, (load.get(c.proId) ?? 0) + 1);
  return [...load.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? pros[0]?.id ?? 'PRO-01';
}

/** A patient writes in. The inquiry automation picks it up a minute later. */
export function receiveInquiry(state: AppState, patient: Patient, text: string): SimEvent[] {
  const conv = newConversation(state, patient.id, 'Consulta nueva', null);
  const events: SimEvent[] = [pushMessage(state, conv, makeMessage(state, 'paciente', text))];
  conv.autoAt = state.clock + 1;
  const day = statsFor(state, dayOf(state.clock));
  day.inquiries += 1;
  state.kpis.inquiriesMonth += 1;
  events.push(addActivity(state, 'mensaje', `${patient.name} escribió: “${text.length > 60 ? `${text.slice(0, 57)}…` : text}”`, `/app/bandeja/?c=${conv.id}`));
  return events;
}

/** Runs the inquiry automation on a conversation (classify, route, auto reply). */
export function processInquiry(state: AppState, conv: Conversation): SimEvent[] {
  const events: SimEvent[] = [];
  conv.autoAt = undefined;
  const patient = patientById(state, conv.patientId);
  const first = conv.messages.find((m) => m.from === 'paciente');
  const result = classify(first?.text ?? '');
  const flow = flowFor(state, 'mensaje-recibido');
  const day = statsFor(state, dayOf(state.clock));
  if (!flow) {
    conv.manualAt = state.clock + 8 + Math.floor((state.rng % 37));
    conv.status = 'atencion';
    return events;
  }
  const clear = result.specialty !== null;
  events.push(runFlow(state, flow, () => (clear ? 'si' : 'no'), clear ? 'Consulta derivada' : 'Consulta a recepción'));
  const firstAt = first?.at ?? state.clock;
  conv.firstResponseMinutes = state.clock - firstAt;
  day.responses += 1;
  day.responseMinutesTotal += conv.firstResponseMinutes;
  day.autoAnswered += 1;
  if (conv.firstResponseMinutes <= 5) state.kpis.answeredFastMonth += 1;
  if (result.specialty) {
    conv.specialty = result.specialty;
    conv.proId = leastLoadedPro(state, result.specialty);
    conv.status = 'derivada';
    conv.topic = `Consulta de ${SPECIALTY_BY_ID[result.specialty].name}`;
    const tpl = flowTemplate(state, flow, 'T-AUTO');
    const appt = { proId: conv.proId } as Appointment;
    const e = tpl ? sendTemplate(state, conv, tpl.id, patient, appt) : null;
    if (e) events.push(e);
    const pro = PRO_BY_ID[conv.proId];
    events.push(addActivity(state, 'derivacion', `Consulta clasificada como ${SPECIALTY_BY_ID[result.specialty].name} y derivada a ${pro?.name ?? 'profesional'}.`, `/app/bandeja/?c=${conv.id}`));
  } else {
    conv.status = 'atencion';
    conv.topic = 'Consulta para recepción';
    const tplRecep = flow.nodes.filter((n) => n.kind === 'message').map((n) => n.value).find((v) => v === 'T-RECEP') ?? 'T-RECEP';
    const e = sendTemplate(state, conv, tplRecep, patient);
    if (e) events.push(e);
    events.push(addNotice(state, 'Consulta para recepción', `${patient?.name ?? 'Un paciente'} necesita que lo atienda una persona.`, 'alerta', `/app/bandeja/?c=${conv.id}`));
  }
  return events;
}

export function findFreeSlot(state: AppState, proId: string, fromDay: number): number | null {
  const taken = new Set(state.appointments.filter((a) => a.proId === proId && a.status !== 'cancelado').map((a) => a.start));
  for (let d = fromDay; d < fromDay + 5; d++) {
    for (let h = 9; h < 18; h++) {
      for (const m of [0, 30]) {
        const start = d * 24 * 60 + h * 60 + m;
        if (start > state.clock + 60 && !taken.has(start) && new Date(Date.UTC(2026, 10, 16 + d)).getUTCDay() !== 0) return start;
      }
    }
  }
  return null;
}

export function apptLabel(a: Appointment): string {
  const pro = PRO_BY_ID[a.proId];
  return `${hhmm(a.start)} con ${pro?.name ?? 'profesional'}`;
}
