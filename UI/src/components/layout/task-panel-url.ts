/** Yalnız seçili görev değişiyor. Tarih, filtre, sayfa ve hash bilgisi korunuyor. */
export function taskPanelUrl(path: string, query: string, taskId: string | null, hash = "") {
  const params = new URLSearchParams(query);
  params.delete("taskId");
  if (taskId !== null) params.set("taskId", taskId);
  return path + (params.size ? `?${params}` : "") + hash;
}

export function validTaskId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
