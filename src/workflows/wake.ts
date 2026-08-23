/** Choose one Pi-native wake primitive for work that outlives the current turn. */

export type WakeMechanism = "async-child-wait" | "event-subscription" | "schedule";

export interface LongRunWakeRequest {
  childRunId?: string;
  event?: string;
  schedule?: string;
}

export type LongRunWakePlan =
  | { mechanism: "async-child-wait"; childRunId: string }
  | { mechanism: "event-subscription"; event: string }
  | { mechanism: "schedule"; schedule: string };

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

/** Child completion wins over event and time fallbacks because it is the precise dependency. */
export function planLongRunWake(request: LongRunWakeRequest): LongRunWakePlan {
  const childRunId = nonEmpty(request.childRunId);
  if (childRunId) return { mechanism: "async-child-wait", childRunId };
  const event = nonEmpty(request.event);
  if (event) return { mechanism: "event-subscription", event };
  const schedule = nonEmpty(request.schedule);
  if (schedule) return { mechanism: "schedule", schedule };
  throw new Error(
    "A long-run wake requires childRunId, event, or schedule; polling is not supported.",
  );
}

export const chooseWakeStrategy = planLongRunWake;
