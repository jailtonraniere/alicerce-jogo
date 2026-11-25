import { audioContext } from "../audioUnlock";

// Audio do jogo sintetizado em tempo real (Web Audio): nada para baixar e sem
// licencas de terceiros. Trilha discreta em la menor, que ganha camadas com a
// velocidade, e efeitos curtos para cada acao. Tom sobrio, volume moderado.

const BPM = 112;
const STEP = 60 / BPM / 4; // semicolcheia
const LOOKAHEAD = 0.12;

// Progressao Am - F - C - G (uma por compasso), com as notas do acorde.
const CHORDS = [
  { root: 110.0, tones: [220.0, 261.63, 329.63, 440.0] },
  { root: 87.31, tones: [174.61, 220.0, 261.63, 349.23] },
  { root: 130.81, tones: [261.63, 329.63, 392.0, 523.25] },
  { root: 98.0, tones: [196.0, 246.94, 293.66, 392.0] },
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];

type ToneOpts = {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  to?: number; // frequencia final (glissando)
  pan?: number;
  dest?: AudioNode;
};

export class GameAudio {
  private readonly master: GainNode;
  private readonly musicBus: GainNode;
  private readonly sfxBus: GainNode;
  private readonly echo: GainNode;
  private readonly noise: AudioBuffer;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private playing = false;
  private intensity = 0;
  private readonly onVisibility = () => {
    if (document.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  static create(): GameAudio | null {
    const ctx = audioContext();
    return ctx ? new GameAudio(ctx) : null;
  }

  private constructor(private readonly ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.16;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.42;
    this.sfxBus.connect(this.master);

    // eco curto para o arpejo (ambiencia "tecnologica")
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.5;
    this.echo.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(this.musicBus);

    // ruido branco reaproveitado (chimbal, sopros, impacto)
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    document.addEventListener("visibilitychange", this.onVisibility);
  }

  // ---- blocos basicos ----

  private out(pan: number, dest: AudioNode) {
    if (!pan) return dest;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  private tone(freq: number, start: number, dur: number, o: ToneOpts = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, start);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, start + dur);
    const peak = o.gain ?? 0.5;
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(this.out(o.pan ?? 0, o.dest ?? this.sfxBus));
    osc.start(start);
    osc.stop(start + dur + 0.02);
    return g;
  }

  private hiss(start: number, dur: number, gain: number, type: BiquadFilterType, from: number, to: number, pan = 0, dest?: AudioNode) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, start);
    f.frequency.exponentialRampToValueAtTime(to, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(pan, dest ?? this.sfxBus));
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  private get now() {
    return this.ctx.currentTime + 0.01;
  }

  // ---- efeitos ----

  collect(pan = 0) {
    const t = this.now;
    this.tone(880, t, 0.09, { type: "triangle", gain: 0.35, pan });
    this.tone(1318.5, t + 0.05, 0.12, { type: "triangle", gain: 0.3, pan });
  }

  indicator(pan = 0) {
    const t = this.now;
    [659.25, 880, 1318.5].forEach((f, i) => this.tone(f, t + i * 0.055, 0.16, { type: "triangle", gain: 0.3, pan }));
  }

  power(kind: string, pan = 0) {
    const t = this.now;
    if (kind === "turbo") {
      this.hiss(t, 0.45, 0.35, "bandpass", 400, 3200, pan);
      this.tone(220, t, 0.4, { type: "sawtooth", gain: 0.12, to: 880, pan });
    } else if (kind === "shield") {
      this.tone(523.25, t, 0.5, { type: "sine", gain: 0.25, pan });
      this.tone(784, t + 0.04, 0.5, { type: "sine", gain: 0.2, pan });
      this.tone(1046.5, t + 0.08, 0.45, { type: "triangle", gain: 0.12, pan });
    } else {
      this.tone(330, t, 0.3, { type: "square", gain: 0.08, to: 990, pan });
      this.tone(660, t + 0.12, 0.25, { type: "triangle", gain: 0.2, pan });
    }
  }

  municipio(pan = 0) {
    const t = this.now;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone(f, t + i * 0.035, 0.7, { type: "sine", gain: 0.16, attack: 0.02, pan })
    );
  }

  jump(pan = 0) {
    this.tone(280, this.now, 0.16, { type: "sine", gain: 0.22, to: 620, pan });
  }

  roll(pan = 0) {
    this.hiss(this.now, 0.22, 0.25, "lowpass", 1800, 300, pan);
  }

  crash(pan = 0) {
    const t = this.now;
    this.tone(140, t, 0.45, { type: "sine", gain: 0.7, to: 38, pan });
    this.hiss(t, 0.35, 0.45, "lowpass", 2600, 200, pan);
    this.tone(392, t + 0.08, 0.35, { type: "triangle", gain: 0.12, to: 196, pan });
  }

  countdown(label: string) {
    const t = this.now;
    if (label === "JÁ") this.tone(1046.5, t, 0.32, { type: "triangle", gain: 0.35 });
    else this.tone(523.25, t, 0.14, { type: "triangle", gain: 0.3 });
  }

  gameOver() {
    const t = this.now + 0.05;
    [523.25, 392, 329.63, 261.63].forEach((f, i) =>
      this.tone(f, t + i * 0.16, 0.5, { type: "triangle", gain: 0.22, attack: 0.01 })
    );
  }

  // ---- trilha ----

  // 0 = comeco calmo, 1 = velocidade maxima (abre filtro e adiciona camadas)
  setIntensity(k: number) {
    this.intensity = Math.max(0, Math.min(1, k));
  }

  startMusic() {
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0.16, this.ctx.currentTime);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, t + 0.4);
  }

  private schedule() {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[bar];
    const k = this.intensity;
    const bus = this.musicBus;

    // pulso grave nos tempos (so 1 e 3 no comeco)
    if (s % 4 === 0 && (k > 0.25 || s % 8 === 0)) {
      this.tone(110, t, 0.22, { type: "sine", gain: 0.55, to: 45, dest: bus });
    }
    // baixo em colcheias, filtro abre com a velocidade
    if (s % 2 === 0) {
      const f = s === 6 || s === 14 ? chord.root * 2 : chord.root;
      const osc = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      lp.type = "lowpass";
      lp.frequency.value = 280 + 900 * k;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.8);
      osc.connect(lp);
      lp.connect(g);
      g.connect(bus);
      osc.start(t);
      osc.stop(t + STEP * 2);
    }
    // arpejo em semicolcheias, com eco
    const note = chord.tones[ARP[s]] * (k > 0.6 && s % 8 === 7 ? 2 : 1);
    const arp = this.tone(note, t, STEP * 0.9, { type: "triangle", gain: 0.1 + 0.05 * k, dest: bus });
    arp.connect(this.echo);
    // chimbal nos contratempos, entra com a velocidade
    if (k > 0.3 && s % 4 === 2) this.hiss(t, 0.05, 0.12 * k, "highpass", 7000, 9000, 0, bus);
  }

  dispose() {
    this.stopMusic();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.master.disconnect();
  }
}
