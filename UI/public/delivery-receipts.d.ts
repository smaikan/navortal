export function queueReceipt(
  owner: string,
  notificationId: string,
  snoozeCount: number,
  stage: "Displayed" | "Opened",
): Promise<void>;
export function clearReceipts(owner: string): Promise<void>;
export function flushReceipts(owner: string, allowed?: () => boolean): Promise<void>;
