// Sayfa ve worker'ın ortak sabit API kimlikleri. Burada ses oluşturulmaz.
export const alertSoundIds = ["bell", "marimba", "digital", "glass", "pulse", "soft"];
export const isAlertSound = value => typeof value === "string" && alertSoundIds.includes(value);
