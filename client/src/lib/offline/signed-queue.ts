export interface SignedQueueItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  signature: string;
  createdAt: string;
}

function checksum(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export function createSignedQueueItem(type: string, payload: Record<string, unknown>): SignedQueueItem {
  const id = `signed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const serialized = JSON.stringify({ id, type, payload });
  return {
    id,
    type,
    payload,
    signature: checksum(serialized),
    createdAt: new Date().toISOString(),
  };
}

export function verifySignedQueueItem(item: SignedQueueItem): boolean {
  const serialized = JSON.stringify({ id: item.id, type: item.type, payload: item.payload });
  return checksum(serialized) === item.signature;
}
