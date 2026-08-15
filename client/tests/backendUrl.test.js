import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBaseUrl } from '../src/lib/backendUrl.js';

test('uses the configured backend URL when provided', () => {
  assert.equal(resolveApiBaseUrl({ envValue: 'https://api.example.com' }), 'https://api.example.com');
});

test('falls back to same-origin in production', () => {
  const result = resolveApiBaseUrl({
    envValue: '',
    currentOrigin: 'https://dashboard.example.com',
    localFallback: 'http://localhost:7000',
    windowLike: { location: { hostname: 'dashboard.example.com' }, localStorage: { getItem: () => null } },
  });

  assert.equal(result, 'https://dashboard.example.com');
});

test('uses localhost fallback for local development', () => {
  const result = resolveApiBaseUrl({
    envValue: '',
    currentOrigin: '',
    localFallback: 'http://localhost:7000',
    windowLike: { location: { hostname: 'localhost' }, localStorage: { getItem: () => null } },
  });

  assert.equal(result, 'http://localhost:7000');
});
