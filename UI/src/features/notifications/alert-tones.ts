import type { AlertSound } from "../../../public/alert-tones.js";
export { isAlertSound } from "../../../public/alert-tones.js";
export type { AlertSound } from "../../../public/alert-tones.js";

type Tone = readonly [offset: number, frequency: number, duration: number, gain: number, wave: OscillatorType];
export const alertTones: Record<AlertSound, { label: string; description: string; notes: readonly Tone[] }> = {
  bell: {
    label: "Çan",
    description: "İki parlak çan vuruşu",
    notes: [
      [0, 784, 0.85, 0.22, "sine"],
      [0, 1568, 0.65, 0.06, "sine"],
      [0.28, 1046.5, 0.95, 0.2, "sine"],
      [0.28, 2093, 0.75, 0.05, "sine"],
    ],
  },
  marimba: {
    label: "Marimba",
    description: "Yükselen üç sıcak nota",
    notes: [
      [0, 523.25, 0.3, 0.3, "triangle"],
      [0.2, 659.25, 0.3, 0.3, "triangle"],
      [0.4, 784, 0.4, 0.3, "triangle"],
    ],
  },
  digital: {
    label: "Dijital",
    description: "Net, üçlü elektronik uyarı",
    notes: [
      [0, 880, 0.18, 0.26, "triangle"],
      [0.28, 880, 0.18, 0.26, "triangle"],
      [0.56, 1174.66, 0.3, 0.26, "triangle"],
    ],
  },
  glass: {
    label: "Cam tınısı",
    description: "İnce ve berrak, uzayan tını",
    notes: [
      [0, 1174.66, 0.7, 0.21, "sine"],
      [0.15, 1568, 0.9, 0.17, "sine"],
      [0.15, 2349.32, 0.7, 0.04, "sine"],
    ],
  },
  pulse: {
    label: "Nabız",
    description: "İki çift ritmik vuruş",
    notes: [
      [0, 440, 0.16, 0.3, "sine"],
      [0.2, 660, 0.25, 0.28, "sine"],
      [0.55, 440, 0.16, 0.3, "sine"],
      [0.75, 660, 0.3, 0.28, "sine"],
    ],
  },
  soft: {
    label: "Yumuşak bip",
    description: "Kısa ve sakin iki nota",
    notes: [
      [0, 660, 0.32, 0.22, "sine"],
      [0.16, 880, 0.32, 0.22, "sine"],
    ],
  },
};
