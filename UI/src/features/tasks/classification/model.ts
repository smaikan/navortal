import { useState } from "react";
import type { components } from "../../../lib/api/generated/schema";
import { ApiError } from "../../../lib/api/errors";
import { validTaskId } from "../../../components/layout/task-panel-url";
import { taskFailure } from "../model";

export type Classification = components["schemas"]["ClassificationView"];
export type ClassificationDraft = {
  projectId: string | null;
  poolId: string | null;
  categoryId: string | null;
  tagIds: string[];
};
export type SingleField = "projectId" | "poolId" | "categoryId";
export type ClassificationField = SingleField | "tagIds";
export const maxTags = 50;
export const fieldKinds = { projectId: "projects", poolId: "pools", categoryId: "categories", tagIds: "tags" } as const;
export const fieldLabels = {
  projectId: "Proje",
  poolId: "Havuz",
  categoryId: "Kategori",
  tagIds: "Etiketler",
} as const;

const integer = (value: unknown) =>
  typeof value === "number"
    ? Number.isSafeInteger(value) && value >= 0
    : typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= 9223372036854775807n;
const link = (value: unknown) => value === null || (typeof value === "string" && validTaskId(value));

export function readClassification(value: Classification, id: string): Classification {
  const v = value?.values;
  if (
    !value ||
    value.taskId !== id ||
    !integer(value.version) ||
    Number(value.version) < 1 ||
    !integer(value.planningVersion) ||
    !v ||
    !link(v.projectId) ||
    !link(v.poolId) ||
    !link(v.categoryId) ||
    !Array.isArray(v.tagIds) ||
    v.tagIds.length > maxTags ||
    !v.tagIds.every(tag => typeof tag === "string" && validTaskId(tag)) ||
    new Set(v.tagIds).size !== v.tagIds.length
  ) {
    throw new ApiError("protocol", "Sınıflandırma yanıtı eksik veya geçersiz. Yeniden yükle.");
  }
  return value;
}
/** Etiketler kümedir. Sıra değişmesi taslağı kirli yapmaz. */
export function classificationDraft(view: Classification): ClassificationDraft {
  return {
    projectId: view.values.projectId ?? null,
    poolId: view.values.poolId ?? null,
    categoryId: view.values.categoryId ?? null,
    tagIds: [...view.values.tagIds].sort(),
  };
}
export function sameDraft(a: ClassificationDraft, b: ClassificationDraft) {
  return (
    a.projectId === b.projectId &&
    a.poolId === b.poolId &&
    a.categoryId === b.categoryId &&
    a.tagIds.length === b.tagIds.length &&
    [...a.tagIds].sort().every((tag, index) => tag === [...b.tagIds].sort()[index])
  );
}
/** Her seferinde tam belge. Eksik alan sunucudaki bağı temizlerdi. */
export function classificationBody(
  base: Classification,
  draft: ClassificationDraft,
  applyToSubtree: boolean,
): components["schemas"]["ClassificationRequest"] {
  if (draft.tagIds.length > maxTags) throw new Error(`En fazla ${maxTags} etiket seçebilirsin.`);
  return {
    version: base.version,
    projectId: draft.projectId,
    poolId: draft.poolId,
    categoryId: draft.categoryId,
    tagIds: [...new Set(draft.tagIds)].sort(),
    applyToSubtree,
    expectedPlanningVersion: applyToSubtree ? base.planningVersion : null,
  };
}
/** Yalnız yerelde değişen alanlar kalır. Etiket kümesi tek alan sayılır. */
export function rebaseClassification(
  base: Classification,
  draft: ClassificationDraft,
  latest: Classification,
): ClassificationDraft {
  const original = classificationDraft(base);
  const remote = classificationDraft(latest);
  const tagsChanged = !sameDraft({ ...original, tagIds: draft.tagIds }, original);
  return {
    projectId: draft.projectId !== original.projectId ? draft.projectId : remote.projectId,
    poolId: draft.poolId !== original.poolId ? draft.poolId : remote.poolId,
    categoryId: draft.categoryId !== original.categoryId ? draft.categoryId : remote.categoryId,
    tagIds: tagsChanged ? [...draft.tagIds].sort() : remote.tagIds,
  };
}
export function classificationFailure(error: unknown) {
  if (error instanceof ApiError && error.outcomeUnknown)
    return "Kaydın sonucu alınamadı. Sınıflandırma kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Güncel sınıflandırmayı kontrol et.";
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      version_conflict: "Görev başka bir yerde değişti. Seçimlerin korundu; güncel sınıflandırmayı kontrol et.",
      planning_version_conflict:
        "Alt görevler veya planın başka bir yerde değişti. Seçimlerin korundu; alt görevlere uygulamadan önce güncel durumu kontrol et.",
      planning_version_required:
        "Alt görevlere uygulamak için güncel planlama sürümü gerekli. Sınıflandırmayı yeniden yükle.",
      resource_not_found:
        "Seçilen proje, havuz, kategori veya etiketlerden birine erişilemiyor. Silinmiş veya bu hesaba ait olmayabilir.",
      task_archived: "Arşivlenmiş görevin sınıflandırması değiştirilemez.",
      task_not_found: "Bu göreve erişilemiyor. Silinmiş veya bu hesaba ait olmayabilir.",
      tags_invalid: `En fazla ${maxTags} etiket seçebilirsin.`,
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 400) return "Sunucu bu sınıflandırmayı kabul etmedi. Seçimleri kontrol et.";
  }
  return error instanceof Error && !(error instanceof ApiError) ? error.message : taskFailure(error);
}
export function blocksClassification(error: unknown) {
  return error instanceof ApiError && (error.outcomeUnknown || error.status === 409 || error.status === 404);
}

/** Taslak responsive Surface'ın üstünde. aside/dialog değişince seçim kaybolmaz. */
export function useClassificationState() {
  const [base, setBase] = useState<Classification | null>(null);
  const [draft, setDraft] = useState<ClassificationDraft | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = !!base && !!draft && !sameDraft(draft, classificationDraft(base));
  return {
    base,
    draft,
    dirty,
    pending,
    setPending,
    setDraft,
    reset(view: Classification, next?: ClassificationDraft) {
      setBase(view);
      setDraft(next ?? classificationDraft(view));
    },
  };
}
export type ClassificationState = ReturnType<typeof useClassificationState>;
