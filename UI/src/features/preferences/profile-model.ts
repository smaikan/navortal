import { ApiError } from "../../lib/api/errors";
import { isValidGooglePictureUrl, type User } from "../auth/session";

export type Profile = {
  user: User & { profileVersion: number };
  photoUploadEnabled: boolean;
  firstName: string;
  lastName: string;
  hasPassword?: boolean;
  googleLinked?: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readProfile(value: unknown): Profile {
  const p = value as Partial<Profile> | null;
  const u = p?.user;
  if (
    !u ||
    typeof u.id !== "string" ||
    !uuid.test(u.id) ||
    typeof u.email !== "string" ||
    typeof u.displayName !== "string" ||
    typeof u.profileVersion !== "number" ||
    !Number.isSafeInteger(u.profileVersion) ||
    u.profileVersion < 1 ||
    (u.photoVersion != null && (typeof u.photoVersion !== "string" || !uuid.test(u.photoVersion))) ||
    (u.googlePictureUrl !== undefined &&
      u.googlePictureUrl !== null &&
      (typeof u.googlePictureUrl !== "string" || !isValidGooglePictureUrl(u.googlePictureUrl))) ||
    typeof p?.photoUploadEnabled !== "boolean" ||
    typeof p.firstName !== "string" ||
    typeof p.lastName !== "string" ||
    (p.hasPassword !== undefined && typeof p.hasPassword !== "boolean") ||
    (p.googleLinked !== undefined && typeof p.googleLinked !== "boolean")
  )
    throw new ApiError("protocol", "Profil bilgileri okunamadı.");
  return p as Profile;
}
export const profileName = (user: User) => (user.displayName === user.email ? "" : user.displayName);
export const validPhoto = (file: Pick<File, "size" | "type">) =>
  file.size > 0 && file.size <= 2 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type);
export async function photoBase64(file: File) {
  if (!validPhoto(file)) throw new Error("En fazla 2 MB boyutunda bir JPEG, PNG veya WebP fotoğraf seç.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
