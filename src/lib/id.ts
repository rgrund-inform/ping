export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID (e.g. older test runners).
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
