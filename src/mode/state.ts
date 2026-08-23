/** The durable state for one active Pi session branch. */
export interface PotetoModeState {
  active: boolean;
}

export const POTETO_MODE_ENTRY = "poteto-mode";

export function modeStateEntry(active: boolean): PotetoModeState {
  return { active };
}

/**
 * Read the last valid mode entry in a branch. Pi's branch projection is the
 * source of truth, so entries outside the active branch are never consulted.
 */
export function restoreModeState(entries: readonly unknown[]): PotetoModeState {
  let active = false;
  for (const entry of entries) {
    if (!isModeEntry(entry)) continue;
    active = entry.data.active;
  }
  return { active };
}

function isModeEntry(
  entry: unknown,
): entry is { type: "custom"; customType: string; data: PotetoModeState } {
  if (!entry || typeof entry !== "object") return false;
  const candidate = entry as Record<string, unknown>;
  const data = candidate.data;
  return (
    candidate.type === "custom" &&
    candidate.customType === POTETO_MODE_ENTRY &&
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).active === "boolean"
  );
}
