let currentSessionId: number | null = null;

export function setActiveSessionId(id: number) {
  currentSessionId = id;
}

export function getActiveSessionId(): number {
  if (currentSessionId === null) {
    throw new Error('No active session set');
  }
  return currentSessionId;
}
