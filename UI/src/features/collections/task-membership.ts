import { ApiError } from "../../lib/api/errors";
import { classificationBody, classificationDraft, type Classification } from "../tasks/classification/model";

export type MembershipKind = "projects" | "pools";
export const membershipField = { projects: "projectId", pools: "poolId" } as const;

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
