// Fixed, fictional catalog for Clínica San Martín (Rosario). Nothing here is a real person or brand.
import type { Professional, Specialty, SpecialtyId } from '../lib/types';
import { createRng } from '../lib/rng';

export const CLINIC = {
  name: 'Clínica San Martín',
  city: 'Rosario',
  product: 'Recepta',
  address: 'Bv. Oroño 1450, Rosario',
} as const;

export const SPECIALTIES: Specialty[] = [
  { id: 'clinica', name: 'Clínica médica', short: 'Clínica', hue: 200, keywords: ['fiebre', 'gripe', 'control', 'chequeo', 'presion', 'analisis', 'resfrio', 'tos', 'cansancio', 'clinico', 'apto'] },
  { id: 'pediatria', name: 'Pediatría', short: 'Pediatría', hue: 160, keywords: ['hijo', 'hija', 'bebe', 'nene', 'nena', 'vacuna', 'pediatra', 'chico', 'nino', 'nina'] },
  { id: 'cardiologia', name: 'Cardiología', short: 'Cardio', hue: 10, keywords: ['corazon', 'cardiologo', 'electro', 'palpitaciones', 'pecho', 'arritmia', 'holter', 'ergometria'] },
  { id: 'dermatologia', name: 'Dermatología', short: 'Dermato', hue: 40, keywords: ['piel', 'mancha', 'lunar', 'acne', 'alergia', 'picazon', 'dermatologo', 'granos'] },
  { id: 'ginecologia', name: 'Ginecología', short: 'Gineco', hue: 330, keywords: ['ginecologo', 'ginecologa', 'pap', 'embarazo', 'mamografia', 'menstruacion', 'anticonceptivo'] },
  { id: 'traumatologia', name: 'Traumatología', short: 'Trauma', hue: 260, keywords: ['rodilla', 'tobillo', 'espalda', 'fractura', 'esguince', 'hombro', 'traumatologo', 'columna', 'yeso'] },
  { id: 'oftalmologia', name: 'Oftalmología', short: 'Oftalmo', hue: 230, keywords: ['ojo', 'ojos', 'vista', 'anteojos', 'lentes', 'oftalmologo', 'vision', 'graduacion'] },
  { id: 'odontologia', name: 'Odontología', short: 'Odonto', hue: 185, keywords: ['muela', 'diente', 'dientes', 'odontologo', 'caries', 'encias', 'limpieza', 'ortodoncia', 'dentista'] },
  { id: 'nutricion', name: 'Nutrición', short: 'Nutrición', hue: 120, keywords: ['dieta', 'peso', 'nutricionista', 'alimentacion', 'bajar', 'celiaco', 'plan alimentario'] },
  { id: 'psicologia', name: 'Psicología', short: 'Psico', hue: 290, keywords: ['ansiedad', 'psicologo', 'psicologa', 'terapia', 'estres', 'angustia', 'dormir', 'insomnio'] },
  { id: 'kinesiologia', name: 'Kinesiología', short: 'Kinesio', hue: 75, keywords: ['kinesiologo', 'kinesio', 'rehabilitacion', 'sesiones', 'contractura', 'masajes', 'ejercicios'] },
  { id: 'otorrino', name: 'Otorrinolaringología', short: 'Otorrino', hue: 25, keywords: ['oido', 'oidos', 'garganta', 'nariz', 'sinusitis', 'otorrino', 'mareos', 'zumbido', 'amigdalas'] },
];

export const SPECIALTY_BY_ID: Record<SpecialtyId, Specialty> = Object.fromEntries(
  SPECIALTIES.map((s) => [s.id, s]),
) as Record<SpecialtyId, Specialty>;

/** How many of the 40 professionals work in each specialty (sums to 40). */
const PRO_COUNT: Record<SpecialtyId, number> = {
  clinica: 5, pediatria: 4, cardiologia: 3, dermatologia: 4, ginecologia: 4, traumatologia: 4,
  oftalmologia: 3, odontologia: 4, nutricion: 2, psicologia: 3, kinesiologia: 2, otorrino: 2,
};

export const FIRST_NAMES = [
  'Lucía', 'Martín', 'Sofía', 'Juan', 'Valentina', 'Mateo', 'Camila', 'Santiago', 'Florencia', 'Tomás',
  'Agustina', 'Nicolás', 'Julieta', 'Federico', 'Micaela', 'Gonzalo', 'Rocío', 'Facundo', 'Carolina', 'Lautaro',
  'Paula', 'Ignacio', 'Belén', 'Matías', 'Romina', 'Diego', 'Antonella', 'Pablo', 'Milagros', 'Ezequiel',
  'Graciela', 'Héctor', 'Silvia', 'Raúl', 'Mónica', 'Alberto', 'Norma', 'Ricardo', 'Liliana', 'Osvaldo',
];

export const LAST_NAMES = [
  'Benítez', 'Ferreyra', 'Acosta', 'Gómez', 'Sosa', 'Romero', 'Medina', 'Herrera', 'Aguirre', 'Giménez',
  'Molina', 'Castro', 'Ortiz', 'Luna', 'Juárez', 'Cabrera', 'Ríos', 'Morales', 'Peralta', 'Godoy',
  'Vega', 'Ledesma', 'Quiroga', 'Navarro', 'Paz', 'Bustos', 'Coronel', 'Ojeda', 'Villalba', 'Ponce',
  'Arce', 'Funes', 'Bianchi', 'Rossi', 'Lombardi', 'Sartori', 'Ferraro', 'Caputo', 'Maldonado', 'Ibarra',
];

export const INSURANCES = ['Salud Rosario', 'Previsión Litoral', 'OSPAR', 'Particular', 'Plan Médico Sur', 'Mutual del Centro'];

export const ROOMS = ['Consultorio 1', 'Consultorio 2', 'Consultorio 3', 'Consultorio 4', 'Consultorio 5', 'Consultorio 6', 'Box A', 'Box B'];

function buildProfessionals(): Professional[] {
  const rng = createRng(4040);
  const used = new Set<string>();
  const list: Professional[] = [];
  let n = 1;
  for (const s of SPECIALTIES) {
    for (let i = 0; i < PRO_COUNT[s.id]; i++) {
      let name = '';
      do {
        const first = rng.pick(FIRST_NAMES);
        const last = rng.pick(LAST_NAMES);
        const title = /a$/.test(first) ? 'Dra.' : 'Dr.';
        name = `${title} ${first} ${last}`;
      } while (used.has(name));
      used.add(name);
      list.push({ id: `PRO-${String(n).padStart(2, '0')}`, name, specialty: s.id, room: rng.pick(ROOMS) });
      n++;
    }
  }
  return list;
}

export const PROFESSIONALS: Professional[] = buildProfessionals();
export const PRO_BY_ID: Record<string, Professional> = Object.fromEntries(PROFESSIONALS.map((p) => [p.id, p]));

/** Typical opening lines a patient sends, grouped by the specialty they should be routed to. */
export const INQUIRIES: Record<SpecialtyId, string[]> = {
  clinica: [
    'Hola, necesito un turno con clínico para un chequeo general',
    'Buenas, tengo fiebre desde ayer y tos, ¿hay turno hoy?',
    'Quería sacar turno para control de presión',
    'Necesito el apto físico para el club, ¿con quién lo saco?',
  ],
  pediatria: [
    'Hola, mi hijo tiene fiebre, ¿hay pediatra mañana?',
    'Necesito turno para las vacunas de mi bebé',
    'Buen día, quería el control de los 6 meses de mi nena',
  ],
  cardiologia: [
    'Me pidieron un electro y control con cardiólogo',
    'Tengo palpitaciones de vez en cuando, ¿me pueden atender?',
    'Necesito turno para ergometría prequirúrgica',
  ],
  dermatologia: [
    'Tengo un lunar que cambió de color, quisiera que lo vean',
    'Hola, ¿atienden acné? Busco dermatólogo',
    'Me salió una mancha en la piel y me pica',
  ],
  ginecologia: [
    'Quería turno para el control anual y el PAP',
    'Hola, estoy de 8 semanas de embarazo y necesito el primer control',
    'Necesito pedir la mamografía, ¿qué ginecóloga atiende los jueves?',
  ],
  traumatologia: [
    'Me doblé el tobillo jugando al fútbol, está hinchado',
    'Tengo dolor de rodilla hace semanas',
    'Necesito control de la fractura, me sacan el yeso',
  ],
  oftalmologia: [
    'Necesito renovar los anteojos, ¿hay oftalmólogo?',
    'Veo borroso de lejos, quisiera un control de la vista',
    'Turno para fondo de ojo, por favor',
  ],
  odontologia: [
    'Me duele mucho una muela, ¿hay turno de urgencia?',
    'Quería una limpieza de dientes',
    'Hola, ¿hacen ortodoncia para adolescentes?',
  ],
  nutricion: [
    'Quiero empezar un plan para bajar de peso',
    'Soy celíaco y necesito ayuda con la alimentación',
  ],
  psicologia: [
    'Hola, estoy con mucha ansiedad y no puedo dormir',
    'Busco turno con psicóloga para terapia',
  ],
  kinesiologia: [
    'El traumatólogo me indicó 10 sesiones de kinesio',
    'Tengo una contractura en la espalda, ¿atienden kinesiología?',
  ],
  otorrino: [
    'Me zumba el oído hace días',
    'Tengo sinusitis otra vez, ¿hay otorrino esta semana?',
  ],
};

/** Lines that the classifier cannot route on its own; they go to the reception queue. */
export const AMBIGUOUS = [
  '¿Hasta qué hora atienden hoy?',
  'Hola, ¿aceptan mi obra social?',
  'Quiero hablar con alguien de administración',
  '¿Dónde estacionar cerca de la clínica?',
  'Necesito una factura del mes pasado',
];

export const PATIENT_REPLIES = {
  confirma: ['Confirmo', 'Confirmo, gracias', 'Sí, confirmo. Ahí estaré', 'Confirmo, nos vemos'],
  reprograma: ['Reprogramo', 'Reprogramo, ese día no puedo', '¿Puede ser otro día? Reprogramo'],
  cancela: ['Cancelo, ya no lo necesito', 'No voy a poder ir, cancelo'],
  gracias: ['Gracias!', 'Perfecto, muchas gracias', 'Genial, gracias por avisar'],
} as const;

/** The demo week starts on Monday 16 November 2026. Minute 0 is that day at 00:00. */
export const WEEK_START = { year: 2026, month: 10, day: 16 } as const;
export const DAY_MIN = 24 * 60;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
