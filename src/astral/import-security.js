import { AsyncLocalStorage } from 'node:async_hooks';
import dns from 'node:dns';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import nodeFetch from 'node-fetch';
const context = new AsyncLocalStorage();
export const withSafeCardImports = callback => context.run(true, callback);
export function publicAddress(address) {
    try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function publicCardURL(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || (ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, '')) && !publicAddress(url.hostname.replace(/^\[|\]$/g, '')))) throw new Error('Character downloads require a public HTTPS address. Use an exported card file instead.');
    return url;
}
const agent = new https.Agent({
    lookup(hostname, options, callback) {
        dns.lookup(hostname, { all: true }, (error, addresses) => {
            if (error) return callback(error);
            if (!addresses.length || addresses.some(a => !publicAddress(a.address))) return callback(new Error('Character download resolved to a private or reserved address.'));
            if (options.all) callback(null, addresses); else callback(null, addresses[0].address, addresses[0].family);
        });
    },
});
export async function cardFetch(input, options = {}) {
    if (!context.getStore()) return nodeFetch(input, options);
    let url = publicCardURL(input), request = { ...options };
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
    for (let redirects = 0; redirects <= 5; redirects++) {
        const response = await nodeFetch(url, { ...request, signal, agent, redirect: 'manual', size: 32 * 1024 ** 2 });
        if (![301, 302, 303, 307, 308].includes(response.status)) {
            if (Number(response.headers.get('content-length')) > 32 * 1024 ** 2) { response.body.destroy(); throw new Error('This character file exceeds the 32 MB import limit.'); }
            return response;
        }
        const location = response.headers.get('location'); response.body.destroy();
        if (!location || redirects === 5) throw new Error('Too many redirects while downloading the character. Use an exported file.');
        url = publicCardURL(new URL(location, url));
        if (response.status === 303 || ([301, 302].includes(response.status) && request.method === 'POST')) { request = { ...request, method: 'GET' }; delete request.body; }
    }
    throw new Error('Character download failed.');
}
