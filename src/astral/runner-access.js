import nodeFetch, { Headers } from 'node-fetch';
const runners = new Map();
export function registerRunner(url, key) { runners.set(new URL(url).origin, key); }
export function forgetRunner(url) { if (url) runners.delete(new URL(url).origin); }
// This credential stays in the backend and is unrelated to desktop window access.
export function runnerFetch(input, options = {}) {
    const key = runners.get(new URL(input).origin);
    if (!key) return nodeFetch(input, options);
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${key}`);
    return nodeFetch(input, { ...options, headers, redirect: 'error' });
}
