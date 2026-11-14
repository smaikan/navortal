import { ApiError } from "../../lib/api/errors";
import { classificationBody, classificationDraft, type Classification } from "../tasks/classification/model";

export type MembershipKind = "projects" | "pools" | "categories";
export const membershipField = { projects: "projectId", pools: "poolId", categories: "categoryId" } as const;

/** Yalnız bu bağı değiştiriyoruz. Son belgenin tamamını kullanarak etiketleri ve diğer bağları koruyoruz. */
export function membershipBody(
  latest: Classification,
  kind: MembershipKind,
  id: string,
  seen: string | null,
  checked: boolean,
) {
  const field = membershipField[kind];
  const target = checked ? id : null;
  if (latest.values[field] === target) return null;
  if (latest.values[field] !== seen) throw new ApiError("http", "Görevin bağı değişti.", 409, "version_conflict");
  return classificationBody(latest, { ...classificationDraft(latest), [field]: target }, false);
}

/** Alt dalı tek işlemde çıkar; diğer bağları sunucu her görevde ayrı korur. */
export function detachMembershipBody(latest: Classification, kind: MembershipKind, id: string) {
  return {
    ...classificationBody(latest, { ...classificationDraft(latest), [membershipField[kind]]: null }, false),
    expectedPlanningVersion: latest.planningVersion,
    detachKind: kind,
    detachResourceId: id,
  };
}
