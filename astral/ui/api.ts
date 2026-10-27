let csrf = '';
export async function request<T = any>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    if (!csrf && body !== undefined) csrf = (await (await fetch('/csrf-token')).json()).token;
    const multipart = body instanceof FormData;
    const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers:
            body === undefined
                ? {}
                : {
                      'X-CSRF-Token': csrf,
                      ...(multipart ? {} : { 'Content-Type': 'application/json' }),
                  },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
        signal,
    });
    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const json = await response.json();
            message = json.error || json.message || message;
        } catch {
            /* Some upstream endpoints return plain text. */
        }
        throw new Error(message);
    }
    const type = response.headers.get('content-type');
    return (type?.includes('json') ? response.json() : response.text()) as Promise<T>;
}
export async function action<T = any>(value: unknown): Promise<T> {
    return (await request('/api/astral/action', value)).result;
}
export async function requestBlob(url: string, body?: unknown): Promise<Blob> {
    if (!csrf && body !== undefined) csrf = (await (await fetch('/csrf-token')).json()).token;
    const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'This download failed. Try an exported file instead.');
    }
    return response.blob();
}
export function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}
