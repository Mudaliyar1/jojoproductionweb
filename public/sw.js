const CACHE_NAME = 'jojo-admin-erp-v6';
const STATIC_ASSETS = [
    '/admin/invoice-system',
    '/admin/invoice-system/invoices',
    '/admin/invoice-system/estimates',
    '/admin/invoice-system/clients',
    '/admin/invoice-system/services',
    '/admin/invoice-system/reports',
    '/admin/invoice-system/settings',
    '/admin/invoice-system/invoices/create',
    '/admin/invoice-system/estimates/create',
    '/css/admin.css',
    '/css/invoice-system.css',
    '/js/pwa-engine.js',
    '/js/invoice-editor.js',
    '/js/offline-data-manager.js',
    '/manifest.json',
    '/images/icons/icon-192.svg',
    '/images/icons/icon-512.svg',
    '/images/icons/icon-192.png',
    '/images/icons/icon-512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Event - Pre-cache Static Assets & HTML Routes Individually
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            console.log('[ServiceWorker v5] Pre-caching static assets individually for zero-fail resilience');
            await Promise.all(
                STATIC_ASSETS.map(url => {
                    return fetch(url, { redirect: 'follow' }).then(response => {
                        if (response.ok || response.status === 200 || response.type === 'opaque') {
                            return cache.put(url, response);
                        }
                    }).catch(err => console.log('[ServiceWorker] Pre-cache skipped:', url));
                })
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate Event - Clean up old caches & take control immediately
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('[ServiceWorker] Cleaning old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Guaranteed Response Caching Strategy (Prevents ERR_FAILED)
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // Skip non-GET requests (handled by IndexedDB queue)
    if (req.method !== 'GET') return;

    // 1. Static Assets (CSS, JS, CDNs, Fonts, Images) -> Cache First
    if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.includes('/fonts/') || url.pathname.includes('/images/') || url.hostname.includes('cdn') || url.hostname.includes('cdnjs') || url.hostname.includes('fonts.googleapis.com')) {
        event.respondWith(
            caches.match(req, { ignoreSearch: true }).then(cachedRes => {
                const fetchPromise = fetch(req).then(networkRes => {
                    if (networkRes.status === 200) {
                        const resClone = networkRes.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
                    }
                    return networkRes;
                }).catch(() => null);
                
                return cachedRes || fetchPromise;
            })
        );
        return;
    }

    // 2. HTML Admin Navigation Requests -> Guaranteed Response (Prevents ERR_FAILED)
    if (req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
        event.respondWith(
            (async () => {
                // Step A: Check exact URL in cache
                let cachedRes = await caches.match(req, { ignoreSearch: true });
                if (cachedRes) {
                    // Update cache in background if online
                    fetch(req).then(async networkRes => {
                        if (networkRes && networkRes.status === 200) {
                            const cache = await caches.open(CACHE_NAME);
                            await cache.put(req, networkRes);
                        }
                    }).catch(() => {});
                    return cachedRes;
                }

                // Step B: Try fetching from network if online
                if (navigator.onLine) {
                    try {
                        const networkRes = await fetch(req);
                        if (networkRes && (networkRes.status === 200 || networkRes.status === 304)) {
                            const resClone = networkRes.clone();
                            const cache = await caches.open(CACHE_NAME);
                            await cache.put(req, resClone);
                            return networkRes;
                        }
                    } catch(e) {}
                }

                // Step C: Try fallback dashboard route from cache
                let fallbackDashboard = await caches.match('/admin/invoice-system', { ignoreSearch: true });
                if (fallbackDashboard) return fallbackDashboard;

                // Step D: Search any cached HTML page starting with /admin/
                try {
                    const keys = await caches.keys();
                    for (let key of keys) {
                        const cache = await caches.open(key);
                        const requests = await cache.keys();
                        for (let r of requests) {
                            if (r.url.includes('/admin/')) {
                                const match = await cache.match(r);
                                if (match) return match;
                            }
                        }
                    }
                } catch(err) {}

                // Step E: Guaranteed Response Shell (Prevents ERR_FAILED completely!)
                return new Response(getOfflineHtmlShell(), {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            })()
        );
        return;
    }

    // 3. API & Other GET Requests -> Network First with Cache Fallback
    event.respondWith(
        fetch(req).then(networkRes => {
            if (networkRes.status === 200) {
                const resClone = networkRes.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
            }
            return networkRes;
        }).catch(async () => {
            const cachedRes = await caches.match(req, { ignoreSearch: true });
            if (cachedRes) return cachedRes;
            const fallbackDashboard = await caches.match('/admin/invoice-system', { ignoreSearch: true });
            if (fallbackDashboard) return fallbackDashboard;

            return new Response(getOfflineHtmlShell(), {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        })
    );
});

// Dynamic Offline HTML Shell (Guarantees Chrome/Brave NEVER displays ERR_FAILED)
function getOfflineHtmlShell() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jojo's Production Admin ERP (Offline Workspace)</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/css/admin.css">
    <link rel="stylesheet" href="/css/invoice-system.css">
    <link rel="manifest" href="/manifest.json">
</head>
<body class="bg-light">
    <nav class="navbar navbar-expand-lg fixed-top admin-navbar px-3">
        <div class="container-fluid p-0">
            <a class="navbar-brand d-flex align-items-center gap-2 m-0" href="/admin/invoice-system">
                <div class="brand-logo-icon"><i class="fas fa-film"></i></div>
                <span class="brand-text">Jojo's Production</span>
            </a>
            <span class="badge bg-warning text-dark border border-warning ms-auto">
                <i class="fas fa-wifi-slash me-1"></i>Working Offline Mode
            </span>
        </div>
    </nav>
    <div class="container-fluid px-4" style="margin-top: 90px;">
        <div class="p-5 bg-white rounded-4 shadow-sm text-center border my-4">
            <div class="mb-3 text-warning"><i class="fas fa-satellite-dish fa-3x"></i></div>
            <h3 class="fw-bold text-dark mb-2">Jojo ERP Offline Workspace</h3>
            <p class="text-secondary mb-4 mx-auto" style="max-width: 540px;">You are currently working offline. All invoices, estimates, clients, and services created or edited now are safely saved in IndexedDB and will sync automatically when internet returns.</p>
            <div class="d-flex justify-content-center gap-3">
                <a href="/admin/invoice-system/invoices/create" class="btn btn-primary"><i class="fas fa-plus me-1"></i>Create Invoice Offline</a>
                <a href="/admin/invoice-system/estimates/create" class="btn btn-outline-primary"><i class="fas fa-plus me-1"></i>Create Estimate Offline</a>
            </div>
        </div>
    </div>
    <script src="/js/pwa-engine.js"></script>
</body>
</html>`;
}

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
        icon: '/images/icons/icon-192.png',
        badge: '/images/icons/icon-192.png',
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
