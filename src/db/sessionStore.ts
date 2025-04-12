let currentSessionId: number | null = null;

export async function setActiveSessionId(id: number): Promise<void> {
  currentSessionId = id;
}

export async function getActiveSessionId(): Promise<number> {
  if (currentSessionId === null) {
    throw new Error('No active session set');
  }
  return currentSessionId;
}
