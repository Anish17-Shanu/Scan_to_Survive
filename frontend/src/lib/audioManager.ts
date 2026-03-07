type SoundName =
  | "scan_success"
  | "trap_alarm"
  | "hint_used"
  | "finish"
  | "warning_tick"
  | "reveal_drum"
  | "powerup"
  | "boss"
  | "broadcast"
  | "ui_toggle"
  | "terminal_blip"
  | "mission_unlock"
  | "click_soft";

class AudioManager {
  private context: AudioContext | null = null;
  private muted = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.muted = localStorage.getItem("scan_audio_muted") === "1";
    }
  }

  private getCtx(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
  }

  private beep(freq: number, durationMs: number, type: OscillatorType, gain = 0.05) {
    const ctx = this.getCtx();
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    volume.gain.value = gain;
    oscillator.connect(volume);
    volume.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  }

  play(name: SoundName) {
    if (this.muted) return;
    switch (name) {
      case "scan_success":
        this.beep(740, 120, "triangle");
        break;
      case "trap_alarm":
        this.beep(180, 350, "sawtooth", 0.08);
        setTimeout(() => this.beep(140, 350, "sawtooth", 0.08), 130);
        break;
      case "hint_used":
        this.beep(450, 200, "square");
        break;
      case "finish":
        this.beep(523, 180, "triangle");
        setTimeout(() => this.beep(659, 180, "triangle"), 120);
        setTimeout(() => this.beep(784, 230, "triangle"), 240);
        break;
      case "warning_tick":
        this.beep(880, 80, "square", 0.03);
        break;
      case "reveal_drum":
        this.beep(110, 120, "square", 0.09);
        setTimeout(() => this.beep(130, 120, "square", 0.09), 130);
        setTimeout(() => this.beep(160, 140, "square", 0.09), 260);
        break;
      case "powerup":
        this.beep(620, 110, "triangle", 0.06);
        setTimeout(() => this.beep(860, 140, "triangle", 0.06), 110);
        break;
      case "boss":
        this.beep(240, 180, "sawtooth", 0.07);
        setTimeout(() => this.beep(320, 190, "sawtooth", 0.07), 120);
        setTimeout(() => this.beep(420, 210, "triangle", 0.07), 250);
        break;
      case "broadcast":
        this.beep(520, 80, "square", 0.05);
        setTimeout(() => this.beep(520, 80, "square", 0.05), 110);
        break;
      case "ui_toggle":
        this.beep(360, 70, "triangle", 0.04);
        setTimeout(() => this.beep(540, 90, "triangle", 0.04), 65);
        break;
      case "terminal_blip":
        this.beep(980, 40, "square", 0.03);
        break;
      case "mission_unlock":
        this.beep(420, 80, "triangle", 0.05);
        setTimeout(() => this.beep(620, 90, "triangle", 0.05), 90);
        setTimeout(() => this.beep(820, 120, "triangle", 0.05), 180);
        break;
      case "click_soft":
        this.beep(280, 35, "sine", 0.025);
        break;
      default:
        break;
    }
  }

  isMuted() {
    return this.muted;
  }

  setMuted(next: boolean) {
    this.muted = next;
    if (typeof window !== "undefined") {
      localStorage.setItem("scan_audio_muted", next ? "1" : "0");
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }
}

export const audioManager = new AudioManager();
