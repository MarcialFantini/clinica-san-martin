// The simulation engine. One tick is one simulated minute; at 1x a tick runs every real second.
// Reminders go out 24 h before each appointment, patients answer, inquiries arrive and are routed,
// campaigns send, and every automation emits a flow-run event that the views animate.
import { AMBIGUOUS, DAY_MIN, INQUIRIES, PATIENT_REPLIES, PRO_BY_ID, SPECIALTIES, FIRST_NAMES, LAST_NAMES, INSURANCES } from '../data/catalog';
import { generateDay, statsFor } from '../data/seed';
import {
  addActivity, addNotice, apptLabel, conversationFor, findFreeSlot, flowFor, flowTemplate, makeMessage, nextId, patientById,
  processInquiry, pushMessage, receiveInquiry, runFlow, sendTemplate,
} from './ops';
import { createRng, type Rng } from './rng';
import { getState, mutate } from './store';
import { dayOf, hourOf, hhmm } from './time';
import type { AppState, Appointment, Patient, SimEvent, Speed } from './types';

const MAX_TICKS_PER_FRAME = 6;

function tick(state: AppState, rng: Rng): SimEvent[] {
  const events: SimEvent[] = [];
  const prevDay = dayOf(state.clock);
  state.clock += 1;
  const now = state.clock;
  const today = dayOf(now);
  if (today !== prevDay) {
    state.kpis.messagesToday = 0;
    events.push(addActivity(state, 'sistema', `Nuevo día en la clínica. Recepta sigue trabajando.`));
  }
  while (state.generatedDays <= today + 2) generateDay(state, state.generatedDays, rng);
  const stats = statsFor(state, today);
  const hour = hourOf(now);
  const open = hour >= 8 && hour < 20;

  // Prune old appointments (keep one week of history).
  if (now % 60 === 0) {
    const limit = (today - 7) * DAY_MIN;
    state.appointments = state.appointments.filter((a) => a.start >= limit);
  }

  const reminderFlow = flowFor(state, 'turno-proximo');
  const cancelFlow = flowFor(state, 'turno-cancelado');
  const postFlow = flowFor(state, 'turno-atendido');

  for (const a of state.appointments) {
    const patient = patientById(state, a.patientId);
    // 1. Reminder 24 h before.
    if (a.status === 'pendiente' && a.remindedAt === undefined && a.start - now <= DAY_MIN && a.start > now) {
      if (!reminderFlow) continue;
      a.remindedAt = now;
      a.status = 'recordado';
      const plan = a.plan ?? 'confirma';
      if (plan !== 'silencio') a.replyAt = now + rng.int(2, 150);
      const conv = conversationFor(state, a.patientId, 'Recordatorio de turno', PRO_BY_ID[a.proId]?.specialty ?? null);
      conv.proId = a.proId;
      conv.status = 'derivada';
      const tpl = flowTemplate(state, reminderFlow, 'T-REC24');
      const e = tpl ? sendTemplate(state, conv, tpl.id, patient, a) : null;
      if (e) events.push(e);
      stats.reminders += 1;
      state.kpis.remindersMonth += 1;
      events.push({ type: 'kpi', key: 'remindersMonth' });
      events.push(runFlow(state, reminderFlow, () => (plan === 'silencio' ? 'no' : 'si'), `Recordatorio a ${patient?.name ?? 'paciente'}`));
      if (rng.chance(0.35)) events.push(addActivity(state, 'recordatorio', `Recordatorio enviado a ${patient?.name ?? 'paciente'} para mañana ${apptLabel(a)}.`, `/app/pacientes/ficha/?id=${a.patientId}`));
      events.push({ type: 'appointment', apptId: a.id, status: a.status });
      continue;
    }
    // 2. Patient answers the reminder.
    if (a.status === 'recordado' && a.replyAt !== undefined && a.replyAt <= now) {
      a.replyAt = undefined;
      events.push(...answerReminder(state, rng, a, patient, cancelFlow !== undefined));
      continue;
    }
    // 3. No answer: second reminder three hours before.
    if (a.status === 'recordado' && a.replyAt === undefined && a.secondReminderAt === undefined && a.start - now <= 180 && a.start > now && reminderFlow) {
      a.secondReminderAt = now;
      const conv = conversationFor(state, a.patientId, 'Recordatorio de turno', null);
      const second = reminderFlow.nodes.filter((n) => n.kind === 'message')[1]?.value ?? 'T-REC2';
      const e = sendTemplate(state, conv, second, patient, a);
      if (e) events.push(e);
      if (rng.chance(0.5)) {
        a.plan = 'confirma';
        a.replyAt = now + rng.int(3, 60);
      } else {
        events.push(addNotice(state, 'Turno sin confirmar', `${patient?.name ?? 'Un paciente'} no respondió para hoy ${apptLabel(a)}.`, 'info', `/app/agenda/?turno=${a.id}`));
      }
      continue;
    }
    // 4. The appointment time passes.
    if ((a.status === 'confirmado' || a.status === 'recordado' || a.status === 'pendiente' || a.status === 'reprogramado') && now >= a.start + a.duration) {
      if (a.status === 'reprogramado') continue;
      const showRate = a.status === 'confirmado' ? 0.97 : a.status === 'recordado' ? 0.6 : 0.7;
      a.status = rng.chance(showRate) ? 'atendido' : 'ausente';
      events.push({ type: 'appointment', apptId: a.id, status: a.status });
      if (a.status === 'atendido' && postFlow && rng.chance(0.5)) {
        events.push(runFlow(state, postFlow, () => 'si', `Encuesta a ${patient?.name ?? 'paciente'}`));
        const t = state.templates.find((x) => x.id === 'T-ENC');
        if (t) t.sent += 1;
      }
      if (a.status === 'ausente') events.push(addActivity(state, 'atencion', `${patient?.name ?? 'Paciente'} no se presentó al turno de las ${hhmm(a.start)}.`, `/app/agenda/?turno=${a.id}`));
    }
  }

  // Inquiries pending automation, manual answers and patient replies.
  for (const c of state.conversations) {
    if (c.autoAt !== undefined && c.autoAt <= now) events.push(...processInquiry(state, c));
    if (c.manualAt !== undefined && c.manualAt <= now) {
      c.manualAt = undefined;
      const first = c.messages.find((m) => m.from === 'paciente');
      c.firstResponseMinutes = now - (first?.at ?? now);
      stats.responses += 1;
      stats.responseMinutesTotal += c.firstResponseMinutes;
      events.push(pushMessage(state, c, makeMessage(state, 'recepcion', 'Hola, perdón la demora. ¿En qué te puedo ayudar?')));
    }
    if (c.replyAt !== undefined && c.replyAt <= now) {
      c.replyAt = undefined;
      c.status = c.status === 'resuelta' ? 'derivada' : c.status;
      events.push(pushMessage(state, c, makeMessage(state, 'paciente', rng.pick(PATIENT_REPLIES.gracias))));
    }
  }

  // New inquiries: more during opening hours.
  if (rng.chance(open ? 0.11 : 0.035)) events.push(...newRandomInquiry(state, rng));

  // A patient thanks the automatic answer now and then.
  if (rng.chance(0.025)) {
    const c = state.conversations.find((x) => x.status === 'derivada' && now - x.updatedAt < 120 && x.messages[x.messages.length - 1]?.from === 'bot');
    if (c) events.push(pushMessage(state, c, makeMessage(state, 'paciente', rng.pick(PATIENT_REPLIES.gracias))));
  }

  // Campaigns.
  for (const camp of state.campaigns) {
    if (camp.status === 'programada' && camp.startAt !== null && camp.startAt <= now) {
      camp.status = 'enviando';
      events.push(addNotice(state, 'Campaña iniciada', `${camp.name} empezó a enviarse.`, 'info', '/app/campanas/'));
      events.push({ type: 'campaign', campaignId: camp.id });
    }
    if (camp.status !== 'enviando') continue;
    if (!open && rng.chance(0.8)) continue;
    const batch = rng.int(0, 2);
    if (batch === 0) continue;
    camp.sent = Math.min(camp.audience, camp.sent + batch);
    if (rng.chance(0.38)) camp.replied += 1;
    if (camp.booked < camp.replied && rng.chance(0.22)) camp.booked += 1;
    const tpl = state.templates.find((t) => t.id === camp.templateId);
    if (tpl) tpl.sent += batch;
    state.kpis.hoursSavedMonth += (batch * 1.5) / 60;
    events.push({ type: 'campaign', campaignId: camp.id });
    if (camp.sent >= camp.audience) {
      camp.status = 'finalizada';
      events.push(addNotice(state, 'Campaña finalizada', `${camp.name}: ${camp.sent} enviados, ${camp.booked} turnos reservados.`, 'ok', '/app/campanas/'));
      events.push(addActivity(state, 'campana', `Campaña ${camp.name} finalizada con ${camp.booked} turnos reservados.`, '/app/campanas/'));
    } else if (camp.sent % 25 === 0) {
      events.push(addActivity(state, 'campana', `Campaña ${camp.name}: ${camp.sent} de ${camp.audience} enviados.`, '/app/campanas/'));
    }
  }

  events.push({ type: 'tick', clock: now });
  return events;
}

function answerReminder(state: AppState, rng: Rng, a: Appointment, patient: Patient | undefined, waitlistOn: boolean): SimEvent[] {
  const events: SimEvent[] = [];
  const stats = statsFor(state, dayOf(state.clock));
  const conv = conversationFor(state, a.patientId, 'Recordatorio de turno', null);
  const name = patient?.name ?? 'Paciente';
  const plan = a.plan ?? 'confirma';
  if (plan === 'confirma') {
    events.push(pushMessage(state, conv, makeMessage(state, 'paciente', rng.pick(PATIENT_REPLIES.confirma))));
    a.status = 'confirmado';
    const e = sendTemplate(state, conv, 'T-CONF', patient, a);
    if (e) events.push(e);
    conv.status = 'resuelta';
    conv.unread = 0;
    stats.confirmations += 1;
    state.kpis.confirmationsMonth += 1;
    events.push({ type: 'kpi', key: 'confirmationsMonth' });
    events.push(addActivity(state, 'confirmacion', `${name} confirmó su turno de ${apptLabel(a)}.`, `/app/agenda/?turno=${a.id}`));
  } else if (plan === 'reprograma') {
    events.push(pushMessage(state, conv, makeMessage(state, 'paciente', rng.pick(PATIENT_REPLIES.reprograma))));
    a.status = 'reprogramado';
    const slot = findFreeSlot(state, a.proId, dayOf(a.start) + 1);
    if (slot !== null) {
      const fresh: Appointment = { id: nextId(state, 'A'), patientId: a.patientId, proId: a.proId, start: slot, duration: 30, status: 'confirmado', remindedAt: state.clock };
      state.appointments.push(fresh);
      const e = sendTemplate(state, conv, 'T-REPRO', patient, fresh);
      if (e) events.push(e);
    }
    conv.status = 'resuelta';
    conv.unread = 0;
    stats.reschedules += 1;
    events.push(addActivity(state, 'reprogramacion', `${name} reprogramó su turno de ${apptLabel(a)}.`, `/app/agenda/?turno=${a.id}`));
  } else {
    events.push(pushMessage(state, conv, makeMessage(state, 'paciente', rng.pick(PATIENT_REPLIES.cancela))));
    a.status = 'cancelado';
    stats.cancellations += 1;
    conv.status = 'resuelta';
    events.push(addActivity(state, 'cancelacion', `${name} canceló su turno de ${apptLabel(a)}.`, `/app/agenda/?turno=${a.id}`));
    const flow = flowFor(state, 'turno-cancelado');
    if (waitlistOn && flow) {
      const pro = PRO_BY_ID[a.proId];
      const candidate = state.patients.find((p) => p.tags.includes('Lista de espera') && p.specialty === pro?.specialty && p.id !== a.patientId)
        ?? state.patients.find((p) => p.tags.includes('Lista de espera') && p.id !== a.patientId);
      const accepted = candidate !== undefined && rng.chance(0.6);
      events.push(runFlow(state, flow, () => (accepted ? 'si' : 'no'), `Lista de espera para las ${hhmm(a.start)}`));
      if (candidate && accepted) {
        const fresh: Appointment = { id: nextId(state, 'A'), patientId: candidate.id, proId: a.proId, start: a.start, duration: a.duration, status: 'confirmado', remindedAt: state.clock };
        state.appointments.push(fresh);
        const wconv = conversationFor(state, candidate.id, 'Turno liberado', pro?.specialty ?? null);
        const e = sendTemplate(state, wconv, 'T-WAIT', candidate, fresh);
        if (e) events.push(e);
        events.push(pushMessage(state, wconv, makeMessage(state, 'paciente', 'Lo tomo')));
        wconv.status = 'resuelta';
        wconv.unread = 0;
        events.push(addActivity(state, 'confirmacion', `Lista de espera: el turno de las ${hhmm(a.start)} pasó a ${candidate.name}.`, `/app/agenda/?turno=${fresh.id}`));
        events.push(addNotice(state, 'Turno recuperado', `El horario de ${hhmm(a.start)} con ${pro?.name ?? 'profesional'} se reasignó desde la lista de espera.`, 'ok', `/app/agenda/?turno=${fresh.id}`));
      } else {
        events.push(addNotice(state, 'Turno liberado', `${name} canceló ${apptLabel(a)}. El horario quedó libre.`, 'alerta', `/app/agenda/?turno=${a.id}`));
      }
    } else {
      events.push(addNotice(state, 'Turno cancelado', `${name} canceló ${apptLabel(a)}.`, 'alerta', `/app/agenda/?turno=${a.id}`));
    }
  }
  events.push({ type: 'appointment', apptId: a.id, status: a.status });
  return events;
}

function newRandomInquiry(state: AppState, rng: Rng): SimEvent[] {
  const ambiguous = rng.chance(0.12);
  const spec = rng.pick(SPECIALTIES);
  const text = ambiguous ? rng.pick(AMBIGUOUS) : rng.pick(INQUIRIES[spec.id]);
  let patient: Patient;
  if (rng.chance(0.15)) {
    patient = {
      id: nextId(state, 'P'), name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      phone: `+54 9 341 555-${String(rng.int(0, 9999)).padStart(4, '0')}`, age: rng.int(18, 80), insurance: rng.pick(INSURANCES),
      specialty: spec.id, tags: ['Nuevo contacto'], notes: '', createdAt: state.clock, lastContactAt: state.clock,
    };
    state.patients.push(patient);
  } else {
    patient = rng.pick(state.patients);
  }
  return receiveInquiry(state, patient, text);
}

// ---------------------------------------------------------------------------
// Loop control

let rng: Rng | null = null;
let timer: number | undefined;
let last = 0;
let acc = 0;

function loop(): void {
  const now = performance.now();
  const s = getState();
  const dt = Math.min(1000, now - last);
  last = now;
  if (s.sim.paused || document.hidden) return;
  acc += (dt / 1000) * s.sim.speed;
  let n = 0;
  if (acc < 1) return;
  mutate((state) => {
    const r = rng ?? createRng(state.rng);
    rng = r;
    const all: SimEvent[] = [];
    while (acc >= 1 && n < MAX_TICKS_PER_FRAME) {
      all.push(...tick(state, r));
      acc -= 1;
      n++;
    }
    if (acc > MAX_TICKS_PER_FRAME) acc = 0;
    state.rng = r.state();
    return all;
  });
}

export function startEngine(): void {
  if (timer !== undefined) return;
  last = performance.now();
  timer = window.setInterval(loop, 100);
}

/** Forget the cached generator (after a reset the state carries a new sequence). */
export function resyncEngine(): void {
  rng = null;
  acc = 0;
}

export function setPaused(paused: boolean): void {
  mutate((s) => {
    s.sim.paused = paused;
  });
}

export function setSpeed(speed: Speed): void {
  mutate((s) => {
    s.sim.speed = speed;
  });
}

/** Jump forward: runs ticks synchronously (used by "Adelantar 1 h" and "Adelantar 24 h"). */
export function advance(minutes: number): void {
  mutate((state) => {
    const r = rng ?? createRng(state.rng);
    rng = r;
    const all: SimEvent[] = [];
    for (let i = 0; i < minutes; i++) {
      const evs = tick(state, r);
      // Only keep the last batch of animation events to avoid flooding the UI.
      if (i >= minutes - 3) all.push(...evs);
    }
    state.rng = r.state();
    all.push(addActivity(state, 'sistema', `Se adelantó el reloj ${minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`}.`));
    return all;
  });
}
