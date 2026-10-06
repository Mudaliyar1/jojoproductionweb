const CACHE_NAME = 'jojo-pwa-online-v7';
const STATIC_ASSETS = [
    '/css/admin.css',
    '/css/invoice-system.css',
    '/css/event-design-system.css',
    '/js/pwa-engine.js',
    '/js/invoice-editor.js',
    '/manifest.json',
    '/images/icons/icon-192.svg',
    '/images/icons/icon-512.svg',
    '/images/icons/icon-192.png',
    '/images/icons/icon-512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

// Install Event - Pre-cache Static Assets Only
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            console.log('[ServiceWorker] Pre-caching static PWA app shell assets');
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
                        console.log('[ServiceWorker] Cleaning legacy offline cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Online-Only ERP Strategy with Offline Fallback Screen
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // Non-GET requests always bypass service worker cache
    if (req.method !== 'GET') return;

    // 1. Static Assets (CSS, JS, Fonts, Icons, Images, CDNs) -> Cache First
    if (url.pathname.endsWith('.css') || 
        url.pathname.endsWith('.js') || 
        url.pathname.includes('/fonts/') || 
        url.pathname.includes('/images/') || 
        url.pathname.includes('/icons/') || 
        url.hostname.includes('cdn') || 
        url.hostname.includes('cdnjs') || 
        url.hostname.includes('fonts.googleapis.com')) {
        
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

    // 2. Dynamic ERP Navigation & Business API Requests -> Strictly Network Only
    // Dynamic ERP business data must ALWAYS come fresh from MongoDB via Node.js server
    if (req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
        event.respondWith(
            fetch(req).catch(() => {
                return new Response(getOfflineHtmlShell(), {
                    status: 503,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            })
        );
        return;
    }

    // 3. API Requests -> Network Only with JSON Offline Error Fallback
    event.respondWith(
        fetch(req).catch(() => {
            return new Response(JSON.stringify({ 
                error: 'NO_INTERNET', 
                message: "An active internet connection is required to interact with Jojo ERP." 
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        })
    );
});

// Clean, Professional Offline State HTML Shell
function getOfflineHtmlShell() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're Offline - Jojo ERP</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            background-color: #f8fafc;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 24px;
        }
        .offline-card {
            background: #ffffff;
            border-radius: 24px;
            padding: 40px 32px;
            max-width: 480px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.06);
            border: 1px solid #e2e8f0;
        }
        .offline-icon {
            width: 80px;
            height: 80px;
            background: #fef2f2;
            color: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            margin: 0 auto 24px auto;
        }
        .offline-title {
            font-weight: 800;
            color: #0f172a;
            font-size: 24px;
            margin-bottom: 12px;
        }
        .offline-desc {
            color: #64748b;
            font-size: 15px;
            margin-bottom: 28px;
            line-height: 1.6;
        }
        .btn-retry {
            background-color: #0f172a;
            color: #ffffff;
            font-weight: 700;
            border-radius: 14px;
            padding: 14px 32px;
            border: none;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            font-size: 15px;
            transition: all 0.2s ease;
            text-decoration: none;
        }
        .btn-retry:hover {
            background-color: #1e293b;
            color: #ffffff;
            transform: translateY(-1px);
        }
    </style>
</head>
<body>
    <div class="offline-card">
        <div class="offline-icon">
            <i class="fas fa-wifi-slash"></i>
        </div>
        <h1 class="offline-title">You're Offline</h1>
        <p class="offline-desc">
            An internet connection is required to use Jojo ERP.<br>
            Please reconnect to continue.
        </p>
        <button class="btn-retry" onclick="window.location.reload()">
            <i class="fas fa-sync-alt"></i> Retry Connection
        </button>
    </div>
</body>
</html>`;
}

// Push Notification Event Handler
self.addEventListener('push', event => {
    let data = { title: "Jojo's Production Alert", body: "New admin notification", url: "/admin" };
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
        data: { url: data.url || '/admin' }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const urlToOpen = event.notification.data ? event.notification.data.url : '/admin';
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
