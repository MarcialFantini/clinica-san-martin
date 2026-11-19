// Fills {{variable}} placeholders in message templates.
import { PRO_BY_ID, SPECIALTY_BY_ID } from '../data/catalog';
import type { Appointment, Patient } from './types';
import { dayLabel, dayOf, hhmm } from './time';

export const TEMPLATE_VARS = ['nombre', 'especialidad', 'profesional', 'dia', 'hora', 'consultorio'] as const;

export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export function varsFor(patient: Patient | undefined, appt?: Appointment): Record<string, string> {
  const pro = appt ? PRO_BY_ID[appt.proId] : undefined;
  return {
    nombre: patient ? (patient.name.split(' ')[0] ?? patient.name) : 'paciente',
    especialidad: pro ? (SPECIALTY_BY_ID[pro.specialty]?.name ?? '') : patient ? (SPECIALTY_BY_ID[patient.specialty]?.name ?? '') : '',
    profesional: pro?.name ?? 'el equipo',
    dia: appt ? dayLabel(dayOf(appt.start)) : '',
    hora: appt ? hhmm(appt.start) : '',
    consultorio: pro?.room ?? 'recepción',
  };
}

/** Sample values used by the template editor preview. */
export const SAMPLE_VARS: Record<string, string> = {
  nombre: 'Lucía',
  especialidad: 'Cardiología',
  profesional: 'Dra. Paula Ríos',
  dia: 'jueves 19 de noviembre',
  hora: '10:30',
  consultorio: 'Consultorio 3',
};
