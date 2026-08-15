export function saveSecureQueue<T>(key: string, payload: T): void {
  const envelope = {
    version: 1,
    payload,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(key, JSON.stringify(envelope));
}

export function loadSecureQueue<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    return envelope.payload as T;
  } catch {
    return null;
  }
}
