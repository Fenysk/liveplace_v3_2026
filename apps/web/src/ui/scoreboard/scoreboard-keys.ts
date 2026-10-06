// Le clavier du classement (JOURNAL 2026-10-06) : un seul avatar prend le Tab, les flèches mènent aux autres.

// L'avatar où le focus doit aller, ou `null` si la touche n'est pas pour la liste.
export function nextFocusIndex(key: string, index: number, count: number): number | null {
  if (index < 0) return null;
  if (key === "ArrowDown") return Math.min(index + 1, count - 1);
  if (key === "ArrowUp") return Math.max(index - 1, 0);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
