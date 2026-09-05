export const MAX_ITEM_NAME_LENGTH = 15;

// Validation for newly created items only. Persisted items deliberately do
// not pass through this helper, so legacy names longer than the current UI
// limit remain unchanged.
export function normalizeNewItemName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_ITEM_NAME_LENGTH) return null;
  return trimmed;
}
