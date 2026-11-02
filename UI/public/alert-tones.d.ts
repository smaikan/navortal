export type AlertSound = "bell" | "marimba" | "digital" | "glass" | "pulse" | "soft";
export const alertSoundIds: readonly AlertSound[];
export function isAlertSound(value: unknown): value is AlertSound;
