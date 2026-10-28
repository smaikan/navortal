import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";

export function acceptDayItemBatch(
  value: components["schemas"]["DayItemBatchResult"],
  expected: { id: string; taskId: string }[],
  date: string,
) {
  if (
    !value ||
    !validTaskId(value.changeSetId) ||
    !Number.isSafeInteger(Number(value.planningVersion)) ||
    Number(value.planningVersion) < 1 ||
    !Array.isArray(value.items) ||
    value.items.length !== expected.length ||
    new Set(value.items.map(item => item.id)).size !== expected.length ||
    expected.some(
      item =>
        !value.items.some(
          result =>
            result.id === item.id &&
            result.taskId === item.taskId &&
            result.localDate === date &&
            result.completedAt === null,
        ),
    )
  )
    throw new ApiError(
      "protocol",
      "Taşıma yanıtı doğrulanamadı. Güncel planı okuyup kontrol et.",
      200,
      undefined,
      {},
      undefined,
      undefined,
      true,
    );
  return value;
}
