// Scene 3: the visitor answers the reminder as the patient; the confirmation rate rolls.
import { CHAT_PATIENTS } from '../../components/landing/data';

export interface ConfirmController {
  demo(): Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function initConfirm(root: HTMLElement, opts: { reduced: boolean }): ConfirmController {
  const log = root.querySelector<HTMLElement>('[data-chat-log]')!;
  const odo = root.querySelector<HTMLElement>('[data-odo]')!;
  const rateText = root.querySelector<HTMLElement>('[data-rate-text]')!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-reply]')];
  const counts = { confirma: 46, reprograma: 6, silencio: 9 };
  let index = 0;
  let busy = false;

  const rate = () => (counts.confirma / (counts.confirma + counts.reprograma + counts.silencio)) * 100;
  const fmtRate = (v: number) => v.toFixed(1).replace('.', ',');

  // Odometer: one vertical strip of digits per character.
  function buildOdo(value: string): void {
    odo.innerHTML = [...value]
      .map((ch) =>
        /\d/.test(ch)
          ? `<span class="odo-digit"><span class="odo-strip" style="transform:translateY(-${Number(ch) * 10}%)">${'0123456789'
              .split('')
              .map((d) => `<span>${d}</span>`)
              .join('')}</span></span>`
          : `<span>${ch}</span>`,
      )
      .join('');
  }

  function setOdo(value: string): void {
    const strips = odo.querySelectorAll<HTMLElement>('.odo-strip');
    const digits = [...value].filter((c) => /\d/.test(c));
    if (strips.length !== digits.length) {
      buildOdo(value);
      return;
    }
    strips.forEach((s, i) => (s.style.transform = `translateY(-${Number(digits[i]) * 10}%)`));
  }

  function bubble(cls: string, text: string): void {
    const li = document.createElement('li');
    li.className = `bubble ${cls}${opts.reduced ? '' : ' in'}`;
    li.textContent = text;
    log.append(li);
  }

  function reminder(): void {
    const p = CHAT_PATIENTS[index % CHAT_PATIENTS.length]!;
    log.innerHTML = '';
    bubble('bot', `Hola ${p.name}, te recordamos tu turno de ${p.specialty} con ${p.pro} el ${p.when}. ¿Confirmás tu asistencia?`);
  }

  async function answer(kind: 'confirma' | 'reprograma'): Promise<void> {
    if (busy) return;
    busy = true;
    buttons.forEach((b) => (b.disabled = true));
    const p = CHAT_PATIENTS[index % CHAT_PATIENTS.length]!;
    bubble('patient', kind === 'confirma' ? 'Confirmo' : 'Reprogramo');
    counts[kind] += 1;
    const v = fmtRate(rate());
    setOdo(v);
    rateText.textContent = `${v} %`;
    for (const [k, n] of Object.entries(counts)) {
      const el = root.querySelector(`[data-count="${k}"]`);
      if (el) el.textContent = String(n);
    }
    await wait(opts.reduced ? 0 : 550);
    bubble(
      'bot',
      kind === 'confirma'
        ? `Listo, ${p.name}. Tu turno quedó confirmado. Te esperamos.`
        : `Sin problema. Te reservamos el ${p.next}. Si no te sirve, respondé y lo cambiamos.`,
    );
    await wait(opts.reduced ? 900 : 1700);
    index++;
    reminder();
    buttons.forEach((b) => (b.disabled = false));
    busy = false;
  }

  buildOdo(fmtRate(rate()));
  for (const b of buttons) b.addEventListener('click', () => void answer(b.dataset.reply === 'reprograma' ? 'reprograma' : 'confirma'));

  return {
    async demo() {
      await answer('confirma');
      await wait(300);
      void answer('confirma');
    },
  };
}
