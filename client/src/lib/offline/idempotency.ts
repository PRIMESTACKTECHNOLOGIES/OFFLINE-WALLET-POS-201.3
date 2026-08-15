const seen = new Set<string>();

export function rememberIdempotencyKey(key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export function clearIdempotencyKeys(): void {
  seen.clear();
}
