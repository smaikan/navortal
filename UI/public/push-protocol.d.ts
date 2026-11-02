import type { AlertSound } from "./alert-tones.js";
export type Envelope = { notificationId: string; recipientUserId: string; snoozeCount: number; tag: string; title: string; body: string; url: string; silent: boolean; sound: AlertSound };
export function deliveryKey(owner: string, id: string, round: number | string): string;
export function notificationPath(id: string, url: string): string | null;
export function readEnvelope(value: unknown): Envelope | null;
