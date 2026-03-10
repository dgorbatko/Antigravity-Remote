const CACHE_NAME = 'ag-phone-v8';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/favicon.ico'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Must include credentials so the offline cache requests pass our Auth middleware!
            const requests = ASSETS_TO_CACHE.map(url => new Request(url, { credentials: 'same-origin' }));
            return Promise.all(requests.map(req => {
                return fetch(req).then(response => {
                    if (!response.ok) throw new Error(`Failed to fetch ${req.url}`);
                    return cache.put(req, response);
                });
            })).catch(e => console.error('Cache addAll failed:', e));
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(async () => {
            const cache = await caches.open(CACHE_NAME);
            // Ignore search parameters so /?source=pwa still matches /
            const cachedResponse = await cache.match(event.request, { ignoreSearch: true });
            if (cachedResponse) return cachedResponse;
            throw new Error('Network and cache failed');
        })
    );
});
