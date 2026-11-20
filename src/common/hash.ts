import { createHash } from 'node:crypto';

export function requestHash(parts: Record<string, string>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((key) => `${key}:${parts[key]}`)
    .join('|');

  return createHash('sha256').update(canonical).digest('hex');
}
