const CACHE_NAME = 'deran-menu-cache-v1';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
    './index.html',
    './manifest.json',
    'https://scared-moccasin-vmjwkvdcjg.edgeone.app/cafe-logo.png'
];

self.addEventListener('install', event => {
    self.skipWaiting(); // Force the waiting service worker to become the active service worker
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(PRECACHE_ASSETS);
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim()); // Become available to all pages
    
    // Clean up old caches
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests (like Firebase Firestore posts)
    if (event.request.method !== 'GET') return;

    // --- STRATEGY 1: CACHE FIRST FOR IMAGES & FONTS & CDNS ---
    // If it's an image from edgeone.app, placehold.co, or a font, cache it aggressively
    if (
        url.hostname.includes('edgeone.app') || 
        url.hostname.includes('placehold.co') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('esm.sh') ||
        url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|mp4)$/i)
    ) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse; // Return from cache instantly
                }
                // If not in cache, fetch and then cache it for next time
                return fetch(event.request).then(networkResponse => {
                    // Check if we received a valid response
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
                        return networkResponse;
                    }
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                }).catch(() => {
                    // Fallback logic if needed
                });
            })
        );
        return;
    }

    // --- STRATEGY 2: STALE-WHILE-REVALIDATE FOR HTML/JS ---
    // For other requests like index.html itself, serve from cache but update in background
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Ignore network errors here since we might have cache
            });

            // Return cache if available, else wait for network
            return cachedResponse || fetchPromise;
        })
    );
});
