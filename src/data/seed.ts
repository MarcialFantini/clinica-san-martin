// Builds the initial demo state from a fixed seed: 12 specialties, 40 professionals,
// a week of appointments and 60 sample conversations. Same seed, same clinic.
import {
  AMBIGUOUS, CLOSE_HOUR, DAY_MIN, FIRST_NAMES, INQUIRIES, INSURANCES, LAST_NAMES, OPEN_HOUR,
  PATIENT_REPLIES, PROFESSIONALS, PRO_BY_ID, SPECIALTIES, SPECIALTY_BY_ID,
} from './catalog';
import { createRng, type Rng } from '../lib/rng';
import { fillTemplate, varsFor } from '../lib/templating';
import { weekdayIndex } from '../lib/time';
import type {
  Activity, AppState, Appointment, Campaign, Conversation, DayStats, Flow, Message, Notice, Patient,
  ReplyPlan, SpecialtyId, Template,
} from '../lib/types';

export const STATE_VERSION = 4;
export const DEFAULT_SEED = 20261116;
/** Monday 09:12: the clinic is already open when the demo starts. */
export const START_CLOCK = 9 * 60 + 12;

export const TEMPLATES_SEED: Template[] = [
  { id: 'T-REC24', name: 'Recordatorio 24 h', category: 'recordatorio', body: 'Hola {{nombre}}, te recordamos tu turno de {{especialidad}} con {{profesional}} el {{dia}} a las {{hora}}. ¿Confirmás tu asistencia?', quickReplies: ['Confirmo', 'Reprogramo'], sent: 2184, replied: 1931, updatedAt: -4000 },
  { id: 'T-REC2', name: 'Segundo aviso', category: 'recordatorio', body: '{{nombre}}, todavía no recibimos tu respuesta para el turno de las {{hora}}. Tocá Confirmo o Reprogramo.', quickReplies: ['Confirmo', 'Reprogramo'], sent: 311, replied: 204, updatedAt: -4000 },
  { id: 'T-CONF', name: 'Turno confirmado', category: 'confirmacion', body: 'Gracias, {{nombre}}. Tu turno quedó confirmado. Te esperamos en {{consultorio}}.', quickReplies: [], sent: 1702, replied: 0, updatedAt: -4000 },
  { id: 'T-REPRO', name: 'Reprogramación', category: 'confirmacion', body: 'Sin problema, {{nombre}}. Te reservamos un nuevo turno el {{dia}} a las {{hora}}. Si no te sirve, respondé y lo cambiamos.', quickReplies: ['Me sirve', 'Otro horario'], sent: 188, replied: 150, updatedAt: -4000 },
  { id: 'T-AUTO', name: 'Respuesta automática', category: 'respuesta', body: 'Hola {{nombre}}, recibimos tu consulta y la derivamos a {{especialidad}}. {{profesional}} o su equipo te responde en breve.', quickReplies: ['Ver turnos', 'Hablar con recepción'], sent: 1391, replied: 640, updatedAt: -4000 },
  { id: 'T-RECEP', name: 'Derivación a recepción', category: 'respuesta', body: 'Gracias por escribir, {{nombre}}. Una persona de recepción te responde en unos minutos.', quickReplies: [], sent: 77, replied: 0, updatedAt: -4000 },
  { id: 'T-ENC', name: 'Encuesta post consulta', category: 'encuesta', body: '¿Cómo fue tu atención con {{profesional}}? Respondé del 1 al 5.', quickReplies: ['5', '4', '3 o menos'], sent: 1240, replied: 590, updatedAt: -4000 },
  { id: 'T-WAIT', name: 'Turno liberado', category: 'recordatorio', body: 'Se liberó un turno de {{especialidad}} el {{dia}} a las {{hora}}. ¿Lo querés?', quickReplies: ['Lo tomo', 'No, gracias'], sent: 96, replied: 71, updatedAt: -4000 },
  { id: 'T-ANUAL', name: 'Control anual', category: 'campana', body: 'Hola {{nombre}}, pasó un año de tu último control de {{especialidad}}. ¿Te reservamos un turno?', quickReplies: ['Sí, reservar', 'Más adelante'], sent: 820, replied: 301, updatedAt: -4000 },
  { id: 'T-GRIPE', name: 'Vacunación antigripal', category: 'campana', body: 'Hola {{nombre}}, ya está disponible la vacuna antigripal. ¿Querés reservar un horario?', quickReplies: ['Reservar', 'Ya me vacuné'], sent: 160, replied: 58, updatedAt: -4000 },
];

const node = (id: string, kind: Flow['nodes'][number]['kind'], x: number, y: number, title: string, detail: string, value: string) =>
  ({ id, kind, x: 40 + Math.round(((x - 40) * 230) / 260), y, title, detail, value });

export const FLOWS_SEED: Flow[] = [
  {
    id: 'F-REC', name: 'Recordatorio 24 h antes', description: 'Recuerda cada turno un día antes, espera la respuesta y actualiza la agenda.', trigger: 'turno-proximo', active: true, runs: 2184, lastRunAt: null, createdAt: -20000,
    nodes: [
      node('n1', 'trigger', 40, 200, 'Turno en 24 h', 'Cada turno de la agenda', 'turno-proximo'),
      node('n2', 'message', 300, 200, 'Enviar recordatorio', 'Plantilla: Recordatorio 24 h', 'T-REC24'),
      node('n3', 'wait', 560, 200, 'Esperar respuesta', 'Hasta 3 h', '3'),
      node('n4', 'condition', 820, 200, '¿Respondió?', 'Confirmo o Reprogramo', 'respondio'),
      node('n5', 'action', 1080, 80, 'Actualizar agenda', 'Confirma o reprograma', 'actualizar-turno'),
      node('n6', 'message', 1080, 320, 'Segundo aviso', 'Plantilla: Segundo aviso', 'T-REC2'),
      node('n7', 'action', 1340, 320, 'Avisar a recepción', 'Si sigue sin respuesta', 'notificar-recepcion'),
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' }, { id: 'e2', from: 'n2', to: 'n3' }, { id: 'e3', from: 'n3', to: 'n4' },
      { id: 'e4', from: 'n4', to: 'n5', branch: 'si' }, { id: 'e5', from: 'n4', to: 'n6', branch: 'no' }, { id: 'e6', from: 'n6', to: 'n7' },
    ],
  },
  {
    id: 'F-INQ', name: 'Consulta entrante', description: 'Clasifica cada mensaje por especialidad, lo deriva al profesional y responde al instante.', trigger: 'mensaje-recibido', active: true, runs: 1468, lastRunAt: null, createdAt: -20000,
    nodes: [
      node('n1', 'trigger', 40, 200, 'Mensaje recibido', 'Canal de mensajería', 'mensaje-recibido'),
      node('n2', 'action', 300, 200, 'Clasificar consulta', 'Por palabras clave', 'clasificar'),
      node('n3', 'condition', 560, 200, '¿Especialidad clara?', 'Confianza mayor a 60 %', 'especialidad'),
      node('n4', 'action', 820, 80, 'Derivar a profesional', 'Al de menor carga', 'derivar'),
      node('n5', 'message', 1080, 80, 'Respuesta automática', 'Plantilla: Respuesta automática', 'T-AUTO'),
      node('n6', 'action', 820, 320, 'Cola de recepción', 'Atiende una persona', 'notificar-recepcion'),
      node('n7', 'message', 1080, 320, 'Aviso de espera', 'Plantilla: Derivación a recepción', 'T-RECEP'),
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' }, { id: 'e2', from: 'n2', to: 'n3' }, { id: 'e3', from: 'n3', to: 'n4', branch: 'si' },
      { id: 'e4', from: 'n4', to: 'n5' }, { id: 'e5', from: 'n3', to: 'n6', branch: 'no' }, { id: 'e6', from: 'n6', to: 'n7' },
    ],
  },
  {
    id: 'F-CAN', name: 'Turno cancelado → lista de espera', description: 'Cuando alguien cancela, ofrece el horario a la lista de espera.', trigger: 'turno-cancelado', active: true, runs: 96, lastRunAt: null, createdAt: -15000,
    nodes: [
      node('n1', 'trigger', 40, 200, 'Turno cancelado', 'Por el paciente o recepción', 'turno-cancelado'),
      node('n2', 'action', 300, 200, 'Buscar lista de espera', 'Misma especialidad', 'lista-espera'),
      node('n3', 'message', 560, 200, 'Ofrecer turno', 'Plantilla: Turno liberado', 'T-WAIT'),
      node('n4', 'condition', 820, 200, '¿Aceptó?', 'Respuesta Lo tomo', 'acepto'),
      node('n5', 'action', 1080, 80, 'Asignar turno', 'Queda en agenda', 'asignar-turno'),
      node('n6', 'end', 1080, 320, 'Liberar horario', 'Queda disponible', 'fin'),
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' }, { id: 'e2', from: 'n2', to: 'n3' }, { id: 'e3', from: 'n3', to: 'n4' },
      { id: 'e4', from: 'n4', to: 'n5', branch: 'si' }, { id: 'e5', from: 'n4', to: 'n6', branch: 'no' },
    ],
  },
  {
    id: 'F-POST', name: 'Encuesta post consulta', description: 'Dos horas después de cada consulta pide una calificación.', trigger: 'turno-atendido', active: true, runs: 1240, lastRunAt: null, createdAt: -12000,
    nodes: [
      node('n1', 'trigger', 40, 200, 'Consulta finalizada', 'Turno marcado como atendido', 'turno-atendido'),
      node('n2', 'wait', 300, 200, 'Esperar', '2 h', '2'),
      node('n3', 'message', 560, 200, 'Enviar encuesta', 'Plantilla: Encuesta post consulta', 'T-ENC'),
      node('n4', 'end', 820, 200, 'Fin', 'Guarda la calificación', 'fin'),
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2' }, { id: 'e2', from: 'n2', to: 'n3' }, { id: 'e3', from: 'n3', to: 'n4' }],
  },
  {
    id: 'F-REAC', name: 'Reactivación de pacientes', description: 'Escribe a quien no vuelve hace un año. Se usa desde Campañas.', trigger: 'manual', active: false, runs: 820, lastRunAt: null, createdAt: -9000,
    nodes: [
      node('n1', 'trigger', 40, 200, 'Inicio manual', 'Desde una campaña', 'manual'),
      node('n2', 'message', 300, 200, 'Invitar a control', 'Plantilla: Control anual', 'T-ANUAL'),
      node('n3', 'wait', 560, 200, 'Esperar', '48 h', '48'),
      node('n4', 'condition', 820, 200, '¿Reservó?', 'Turno creado', 'reservo'),
      node('n5', 'end', 1080, 80, 'Fin', 'Paciente reactivado', 'fin'),
      node('n6', 'action', 1080, 320, 'Etiquetar', 'Seguimiento manual', 'etiquetar'),
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' }, { id: 'e2', from: 'n2', to: 'n3' }, { id: 'e3', from: 'n3', to: 'n4' },
      { id: 'e4', from: 'n4', to: 'n5', branch: 'si' }, { id: 'e5', from: 'n4', to: 'n6', branch: 'no' },
    ],
  },
];

const CAMPAIGNS_SEED: Campaign[] = [
  { id: 'C-01', name: 'Control cardiológico anual', templateId: 'T-ANUAL', specialty: 'cardiologia', audience: 310, sent: 310, replied: 122, booked: 74, status: 'finalizada', createdAt: -9000, startAt: -8000 },
  { id: 'C-02', name: 'Vacunación antigripal', templateId: 'T-GRIPE', specialty: 'todas', audience: 420, sent: 160, replied: 58, booked: 31, status: 'enviando', createdAt: -2000, startAt: -600 },
  { id: 'C-03', name: 'Limpieza dental semestral', templateId: 'T-ANUAL', specialty: 'odontologia', audience: 185, sent: 0, replied: 0, booked: 0, status: 'programada', createdAt: -1500, startAt: 2 * DAY_MIN + 10 * 60 },
  { id: 'C-04', name: 'Pacientes sin visita hace un año', templateId: 'T-ANUAL', specialty: 'todas', audience: 640, sent: 0, replied: 0, booked: 0, status: 'borrador', createdAt: -300, startAt: null },
];

export function planReply(rng: Rng): ReplyPlan {
  const r = rng.next();
  if (r < 0.74) return 'confirma';
  if (r < 0.84) return 'reprograma';
  if (r < 0.9) return 'cancela';
  return 'silencio';
}

function buildPatients(rng: Rng, count: number): Patient[] {
  const list: Patient[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let name = '';
    do name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`; while (used.has(name) && used.size < 1500);
    used.add(name);
    const specialty = rng.pick(SPECIALTIES).id;
    const tags: string[] = [];
    if (rng.chance(0.18)) tags.push('Paciente frecuente');
    if (rng.chance(0.1)) tags.push('Lista de espera');
    if (rng.chance(0.08)) tags.push('Prefiere mañana');
    if (rng.chance(0.06)) tags.push('Requiere acompañante');
    list.push({
      id: `P-${String(i + 1).padStart(4, '0')}`,
      name,
      phone: `+54 9 341 555-${String(rng.int(0, 9999)).padStart(4, '0')}`,
      age: specialty === 'pediatria' ? rng.int(1, 14) : rng.int(18, 84),
      insurance: rng.pick(INSURANCES),
      specialty,
      tags,
      notes: '',
      createdAt: -rng.int(30, 900) * DAY_MIN,
      lastContactAt: -rng.int(1, 300) * DAY_MIN + rng.int(8 * 60, 20 * 60),
    });
  }
  return list;
}

/** Adds the appointments of one clinic day (Sunday closed, Saturday mornings only). */
export function generateDay(state: AppState, day: number, rng: Rng): void {
  const weekday = weekdayIndex(day);
  if (weekday === 0) return;
  const close = weekday === 6 ? 13 : CLOSE_HOUR;
  const byPatientSpec = new Map<SpecialtyId, Patient[]>();
  for (const p of state.patients) {
    const arr = byPatientSpec.get(p.specialty) ?? [];
    arr.push(p);
    byPatientSpec.set(p.specialty, arr);
  }
  for (const pro of PROFESSIONALS) {
    if (weekday === 6 && rng.chance(0.5)) continue;
    const morning = rng.chance(0.5);
    const from = weekday === 6 ? OPEN_HOUR : morning ? OPEN_HOUR : 14;
    const to = weekday === 6 ? close : morning ? 14 : close;
    const slots = (to - from) * 2;
    const want = Math.min(slots, rng.int(3, weekday === 6 ? 4 : 6));
    const chosen = new Set<number>();
    while (chosen.size < want) chosen.add(rng.int(0, slots - 1));
    for (const slot of [...chosen].sort((a, b) => a - b)) {
      const pool = byPatientSpec.get(pro.specialty);
      const patient = pool && pool.length && rng.chance(0.7) ? rng.pick(pool) : rng.pick(state.patients);
      state.seq++;
      state.appointments.push({
        id: `A-${state.seq}`,
        patientId: patient.id,
        proId: pro.id,
        start: day * DAY_MIN + from * 60 + slot * 30,
        duration: 30,
        status: 'pendiente',
        plan: planReply(rng),
      });
    }
  }
  state.generatedDays = Math.max(state.generatedDays, day + 1);
}

function emptyStats(day: number): DayStats {
  return { day, reminders: 0, confirmations: 0, reschedules: 0, cancellations: 0, inquiries: 0, autoAnswered: 0, responseMinutesTotal: 0, responses: 0 };
}

export function statsFor(state: AppState, day: number): DayStats {
  let s = state.stats.find((d) => d.day === day);
  if (!s) {
    s = emptyStats(day);
    state.stats.push(s);
    state.stats.sort((a, b) => a.day - b.day);
    if (state.stats.length > 21) state.stats.splice(0, state.stats.length - 21);
  }
  return s;
}

function msg(state: AppState, from: Message['from'], text: string, at: number, quickReplies?: string[]): Message {
  state.seq++;
  return quickReplies && quickReplies.length ? { id: `M-${state.seq}`, from, text, at, quickReplies } : { id: `M-${state.seq}`, from, text, at };
}

export function createInitialState(seed = DEFAULT_SEED): AppState {
  const rng = createRng(seed);
  const state: AppState = {
    version: STATE_VERSION,
    seed,
    rng: 0,
    clock: START_CLOCK,
    seq: 0,
    sim: { paused: false, speed: 1 },
    patients: buildPatients(rng, 280),
    appointments: [],
    conversations: [],
    flows: structuredClone(FLOWS_SEED),
    templates: structuredClone(TEMPLATES_SEED),
    campaigns: structuredClone(CAMPAIGNS_SEED),
    activity: [],
    notices: [],
    stats: [],
    kpis: { remindersMonth: 2184, confirmationsMonth: 1702, answeredFastMonth: 1391, inquiriesMonth: 1468, hoursSavedMonth: 96, messagesToday: 0 },
    generatedDays: 0,
  };

  for (let d = 0; d < 6; d++) generateDay(state, d, rng);

  // Previous week, for the charts.
  for (let d = -7; d < 0; d++) {
    if (weekdayIndex(d) === 0) continue;
    const s = statsFor(state, d);
    s.reminders = rng.int(150, 190);
    s.confirmations = Math.round(s.reminders * (0.72 + rng.next() * 0.1));
    s.reschedules = rng.int(10, 22);
    s.cancellations = rng.int(6, 14);
    s.inquiries = rng.int(60, 95);
    s.autoAnswered = Math.round(s.inquiries * (0.86 + rng.next() * 0.08));
    s.responses = s.inquiries;
    s.responseMinutesTotal = Math.round(s.inquiries * (1.2 + rng.next() * 1.6));
  }
  // Today so far (the clinic opened at 08:00).
  Object.assign(statsFor(state, 0), { reminders: 41, confirmations: 30, reschedules: 3, cancellations: 1, inquiries: 16, autoAnswered: 15, responses: 16, responseMinutesTotal: 22 });

  const patientById = new Map(state.patients.map((p) => [p.id, p]));
  const tplById = new Map(state.templates.map((t) => [t.id, t]));
  const rec = tplById.get('T-REC24');
  const conf = tplById.get('T-CONF');
  const auto = tplById.get('T-AUTO');
  const recep = tplById.get('T-RECEP');

  // Reminders already sent for everything inside the next 24 h, past appointments resolved.
  for (const a of state.appointments) {
    if (a.start < state.clock) {
      a.status = a.plan === 'cancela' ? 'cancelado' : rng.chance(0.93) ? 'atendido' : 'ausente';
      a.remindedAt = a.start - DAY_MIN;
    } else if (a.start - state.clock <= DAY_MIN) {
      a.remindedAt = a.start - DAY_MIN;
      if (a.plan === 'confirma' && rng.chance(0.8)) a.status = 'confirmado';
      else {
        a.status = 'recordado';
        a.replyAt = state.clock + rng.int(3, 160);
      }
    }
  }

  // 24 reminder conversations, from the confirmed ones.
  const reminded = state.appointments.filter((a) => a.remindedAt !== undefined && a.start >= state.clock - 120);
  for (let i = 0; i < 24 && i < reminded.length; i++) {
    const a = reminded[Math.floor((i * reminded.length) / 24)] as Appointment;
    const p = patientById.get(a.patientId);
    if (!p) continue;
    const pro = PRO_BY_ID[a.proId];
    const sent = (a.remindedAt ?? 0) + rng.int(0, 2);
    const messages: Message[] = [msg(state, 'bot', fillTemplate(rec?.body ?? '', varsFor(p, a)), sent, rec?.quickReplies)];
    let updatedAt = sent;
    if (a.status === 'confirmado' || a.status === 'atendido') {
      const at = sent + rng.int(4, 90);
      messages.push(msg(state, 'paciente', rng.pick(PATIENT_REPLIES.confirma), at));
      messages.push(msg(state, 'bot', fillTemplate(conf?.body ?? '', varsFor(p, a)), at + 1));
      updatedAt = at + 1;
    }
    state.conversations.push({
      id: `CV-${state.seq++}`, patientId: p.id, specialty: pro?.specialty ?? null, proId: a.proId,
      status: a.status === 'recordado' ? 'derivada' : 'resuelta', unread: 0, updatedAt, topic: 'Recordatorio de turno', messages,
    });
  }

  // 36 inquiries: routed, a few ambiguous ones waiting for reception.
  for (let i = 0; i < 36; i++) {
    const at = state.clock - rng.int(5, 2 * DAY_MIN);
    const ambiguous = i % 9 === 4;
    const spec = rng.pick(SPECIALTIES);
    const text = ambiguous ? rng.pick(AMBIGUOUS) : rng.pick(INQUIRIES[spec.id]);
    const p = rng.pick(state.patients);
    const pros = PROFESSIONALS.filter((x) => x.specialty === spec.id);
    const pro = ambiguous ? undefined : rng.pick(pros);
    const fakeAppt = pro ? ({ proId: pro.id } as Appointment) : undefined;
    const messages: Message[] = [msg(state, 'paciente', text, at)];
    const firstResponse = rng.int(0, 2);
    if (ambiguous) messages.push(msg(state, 'bot', fillTemplate(recep?.body ?? '', varsFor(p)), at + firstResponse));
    else messages.push(msg(state, 'bot', fillTemplate(auto?.body ?? '', varsFor(p, fakeAppt)), at + firstResponse, auto?.quickReplies));
    const recent = state.clock - at < 90;
    let status: Conversation['status'] = ambiguous ? 'atencion' : 'derivada';
    if (!recent && rng.chance(0.55)) {
      messages.push(msg(state, 'recepcion', ambiguous ? 'Hola, sí. Te paso la info por acá.' : 'Te reservamos un turno para esta semana, te llega la confirmación.', at + rng.int(6, 40)));
      status = 'resuelta';
    }
    const last = messages[messages.length - 1] as Message;
    state.conversations.push({
      id: `CV-${state.seq++}`, patientId: p.id, specialty: ambiguous ? null : spec.id, proId: pro?.id ?? null,
      status, unread: recent || status === 'atencion' ? 1 : 0, updatedAt: last.at,
      topic: ambiguous ? 'Consulta administrativa' : `Consulta de ${SPECIALTY_BY_ID[spec.id].name}`,
      messages, firstResponseMinutes: firstResponse,
    });
  }
  state.conversations.sort((a, b) => b.updatedAt - a.updatedAt);

  const seedActivity: Array<[Activity['kind'], string, number]> = [
    ['sistema', 'Recepta empezó el turno mañana: 4 automatizaciones activas.', START_CLOCK - 72],
    ['recordatorio', '214 recordatorios enviados para los turnos de hoy.', START_CLOCK - 60],
    ['confirmacion', '163 pacientes confirmaron su turno de hoy.', START_CLOCK - 30],
    ['campana', 'Campaña Vacunación antigripal: 160 de 420 mensajes enviados.', START_CLOCK - 12],
  ];
  state.activity = seedActivity.map(([kind, text, at], i) => ({ id: `ACT-s${i}`, kind, text, at })).reverse();
  const seedNotices: Notice[] = [
    { id: 'N-s1', title: 'Consultas para recepción', body: 'Hay 4 consultas administrativas esperando a una persona.', at: START_CLOCK - 20, read: false, tone: 'alerta', href: '/app/bandeja/?filtro=atencion' },
    { id: 'N-s2', title: 'Campaña en curso', body: 'Vacunación antigripal sigue enviando a un ritmo de 60 por hora.', at: START_CLOCK - 12, read: false, tone: 'info', href: '/app/campanas/' },
    { id: 'N-s3', title: 'Agenda de hoy', body: '87 % de los turnos de hoy ya están confirmados.', at: START_CLOCK - 40, read: true, tone: 'ok', href: '/app/agenda/' },
  ];
  state.notices = seedNotices;
  state.rng = rng.state();
  return state;
}
