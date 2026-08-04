const CACHE_NAME = 'jojo-admin-erp-v1';
const STATIC_ASSETS = [
    '/admin/invoice-system',
    '/css/admin.css',
    '/css/invoice-system.css',
    '/js/pwa-engine.js',
    '/js/invoice-editor.js',
    '/manifest.json',
    '/images/icons/icon-192.svg',
    '/images/icons/icon-512.svg',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Event - Pre-cache Static Assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[ServiceWorker] Pre-caching static assets');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('[ServiceWorker] Removing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Hybrid Caching Strategy
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // Skip non-GET requests (POST/PUT/DELETE handled by IndexedDB offline queue)
    if (req.method !== 'GET') return;

    // Static Assets & Fonts -> Cache First
    if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.includes('/fonts/') || url.pathname.includes('/icons/')) {
        event.respondWith(
            caches.match(req).then(cachedRes => {
                if (cachedRes) return cachedRes;
                return fetch(req).then(networkRes => {
                    if (networkRes.status === 200) {
                        const resClone = networkRes.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
                    }
                    return networkRes;
                });
            })
        );
        return;
    }

    // HTML Admin Navigation & API -> Network First with Cache Fallback
    event.respondWith(
        fetch(req).then(networkRes => {
            if (networkRes.status === 200) {
                const resClone = networkRes.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
            }
            return networkRes;
        }).catch(async () => {
            const cachedRes = await caches.match(req);
            if (cachedRes) return cachedRes;
            
            // Offline Fallback Page
            if (req.headers.get('accept').includes('text/html')) {
                return caches.match('/admin/invoice-system');
            }
        })
    );
});

// Push Notification Event Handler
self.addEventListener('push', event => {
    let data = { title: "Jojo's Production Alert", body: "New admin notification", url: "/admin/invoice-system" };
    try {
        if (event.data) data = event.data.json();
    } catch(e) {
        if (event.data) data.body = event.data.text();
    }

    const options = {
        body: data.body,
        icon: '/images/icons/icon-192.svg',
        badge: '/images/icons/icon-192.svg',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/admin/invoice-system' },
        actions: [
            { action: 'open', title: 'Open Page' },
            { action: 'close', title: 'Dismiss' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'close') return;

    const urlToOpen = event.notification.data ? event.notification.data.url : '/admin/invoice-system';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let client of windowClients) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Background Sync Listener
self.addEventListener('sync', event => {
    if (event.tag === 'sync-pending-queue') {
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' });
                });
            })
        );
    }
});
