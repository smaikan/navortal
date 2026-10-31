import type { components } from "../../lib/api/generated/schema";
export type ImmediateRequest = components["schemas"]["ImmediateWorkRequest"];
export type Receipt = components["schemas"]["ImmediateWorkReceipt"];
export type Immediate = {
  receipt: Receipt;
  plan: components["schemas"]["SchedulingPreviewView"] | null;
  status: string;
  error: string | null;
  replayed: boolean;
  planInvalid: boolean;
};
