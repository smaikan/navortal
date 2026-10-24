import { ApiError } from "./errors";

function supportedNumber(value: unknown): unknown {
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
    throw new ApiError("protocol", "Sunucunun sayısal değeri bu sürümde güvenle işlenemiyor.");
  }
  return value;
}

export function parseApiJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown) => supportedNumber(value));
}

export function serializeBody(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, child: unknown) => supportedNumber(child));
}
