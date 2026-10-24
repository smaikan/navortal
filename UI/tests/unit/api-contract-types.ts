import type { createApiClient } from "../../src/lib/api/client";

/** Yalnız derleme kontrolü. Üretilmiş DTO ve yöntem/adres kısıtları esas kalır. */
export function checkContractTypes(api: ReturnType<typeof createApiClient>) {
  api.read("/api/tasks");
  api.read("/api/tasks/{id}", { path: { id: "task-id" } });
  api.mutation("/api/tasks", "post", { body: { title: "Küçük adım" } });
  // @ts-expect-error Login için GET işlemi yok.
  api.read("/api/auth/login");
  // @ts-expect-error Ayrıntıda path id zorunlu.
  api.read("/api/tasks/{id}");
  // @ts-expect-error Üretilmiş sözleşmede görev başlığı zorunlu.
  api.mutation("/api/tasks", "post", { body: {} });
  // @ts-expect-error Durum ayrı komuttur, görev güncelleme alanı değil.
  api.mutation("/api/tasks", "post", { body: { title: "Adım", status: "Completed" } });
}
