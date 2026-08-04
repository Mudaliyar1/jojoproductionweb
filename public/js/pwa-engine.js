/**
 * Jojo's Production Admin - Enterprise Progressive Web App (PWA) Engine
 * Handles Offline Storage (IndexedDB), Service Worker, Real-time WebSockets, Background Sync & Install Prompts.
 */

let deferredInstallPrompt = null;
let db = null;
let ws = null;

document.addEventListener('DOMContentLoaded', function() {
    // Non-blocking async background tasks
    initIndexedDB();
    initServiceWorker();
    initNetworkMonitor();
    initWebSocketSync();
    initInstallPrompt();
    initOfflineFormInterception();
});

// ----------------------------------------------------
// 1. Service Worker Initialization & Push Registration
// ----------------------------------------------------
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {
                console.log('[PWA Engine] ServiceWorker registered with scope:', reg.scope);
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showPwaToast('New system version available! Refresh to update.', 'info');
                        }
                    };
                };
            })
            .catch(err => console.error('[PWA Engine] ServiceWorker registration failed:', err));

        // Listen for messages from Service Worker
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'TRIGGER_BACKGROUND_SYNC') {
                flushOfflineQueue();
            }
        });
    }
}

// ----------------------------------------------------
// 2. IndexedDB Database Setup for Offline Queue
// ----------------------------------------------------
function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('JojoAdminDB', 1);

        request.onupgradeneeded = event => {
            const dbRef = event.target.result;
            if (!dbRef.objectStoreNames.contains('pendingActions')) {
                dbRef.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
            }
            if (!dbRef.objectStoreNames.contains('cachedMetadata')) {
                dbRef.createObjectStore('cachedMetadata', { keyPath: 'key' });
            }
        };

        request.onsuccess = event => {
            db = event.target.result;
            console.log('[PWA Engine] IndexedDB JojoAdminDB ready');
            resolve(db);
        };

        request.onerror = event => {
            console.error('[PWA Engine] IndexedDB error:', event.target.error);
            resolve(null);
        };
    });
}

// Queue action in IndexedDB when offline
async function queueOfflineAction(url, method, bodyData) {
    if (!db) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['pendingActions'], 'readwrite');
        const store = tx.objectStore('pendingActions');
        const action = {
            url: url,
            method: method || 'POST',
            body: bodyData,
            timestamp: new Date().toISOString()
        };
        const req = store.add(action);
        req.onsuccess = () => {
            console.log('[PWA Engine] Offline action queued in IndexedDB:', action);
            updateOfflineBadgeCount();
            showPwaToast('Action saved locally! Will sync automatically when online.', 'warning');
            resolve(req.result);
        };
        req.onerror = () => reject(req.error);
    });
}

// Flush pending offline queue to server when connection returns
async function flushOfflineQueue() {
    if (!navigator.onLine || !db) return;

    const tx = db.transaction(['pendingActions'], 'readonly');
    const store = tx.objectStore('pendingActions');
    const getAllReq = store.getAll();

    getAllReq.onsuccess = async () => {
        const pending = getAllReq.result;
        if (!pending || pending.length === 0) return;

        showPwaToast(`Syncing ${pending.length} pending offline actions...`, 'info');
        let successCount = 0;

        for (let item of pending) {
            try {
                const res = await fetch(item.url, {
                    method: item.method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: typeof item.body === 'string' ? item.body : JSON.stringify(item.body)
                });
                if (res.ok || res.status === 200 || res.status === 201) {
                    // Remove resolved item from IndexedDB
                    const deleteTx = db.transaction(['pendingActions'], 'readwrite');
                    deleteTx.objectStore('pendingActions').delete(item.id);
                    successCount++;
                }
            } catch (err) {
                console.error('[PWA Engine] Failed to sync item:', item, err);
            }
        }

        if (successCount > 0) {
            updateOfflineBadgeCount();
            showPwaToast(`Successfully synchronized ${successCount} offline action(s)!`, 'success');
            // Refresh data in active view if relevant
            setTimeout(() => window.location.reload(), 1200);
        }
    };
}

async function updateOfflineBadgeCount() {
    if (!db) return;
    const tx = db.transaction(['pendingActions'], 'readonly');
    const store = tx.objectStore('pendingActions');
    const countReq = store.count();

    countReq.onsuccess = () => {
        const count = countReq.result;
        const badge = document.getElementById('pwaOfflineBadge');
        if (badge) {
            if (count > 0) {
                badge.innerText = `${count} Pending`;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }
    };
}

// Intercept form submissions if offline
function initOfflineFormInterception() {
    window.addEventListener('online', () => {
        updateNetworkStatusUI(true);
        flushOfflineQueue();
    });

    window.addEventListener('offline', () => {
        updateNetworkStatusUI(false);
    });

    updateNetworkStatusUI(navigator.onLine);
}

// ----------------------------------------------------
// 3. Real-Time WebSocket Synchronization
// ----------------------------------------------------
function initWebSocketSync() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[PWA Engine] Real-time WebSocket connected');
        };

        ws.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                console.log('[PWA Engine] Real-time WebSocket event received:', data);
                handleRealtimeMutation(data);
            } catch(e) {
                // Raw text or ping message
            }
        };

        ws.onclose = () => {
            console.log('[PWA Engine] Real-time WebSocket closed. Reconnecting in 5s...');
            setTimeout(initWebSocketSync, 5000);
        };

        ws.onerror = err => {
            console.error('[PWA Engine] WebSocket error:', err);
        };
    } catch(e) {
        console.error('[PWA Engine] WebSocket init exception:', e);
    }
}

function handleRealtimeMutation(data) {
    if (!data || !data.type) return;

    if (data.type === 'INVOICE_MUTATION' || data.type === 'ESTIMATE_MUTATION' || data.type === 'CLIENT_MUTATION') {
        showPwaToast(`Real-time update: ${data.action} ${data.docType || 'record'} ${data.number || ''}`, 'info');
        // If user is currently looking at invoice directory or estimate list, soft reload or highlight
        if (window.location.pathname.includes('/admin/invoice-system')) {
            const refreshBtn = document.getElementById('btnRefreshData');
            if (refreshBtn) refreshBtn.classList.add('btn-warning');
        }
    }
}

// ----------------------------------------------------
// 4. Network Status UI & Toast Notifications
// ----------------------------------------------------
function updateNetworkStatusUI(isOnline) {
    const indicator = document.getElementById('pwaNetworkStatusIndicator');
    if (indicator) {
        if (isOnline) {
            indicator.className = 'badge bg-success-subtle text-success border border-success me-2';
            indicator.innerHTML = '<i class="fas fa-wifi me-1"></i>Online';
        } else {
            indicator.className = 'badge bg-danger-subtle text-danger border border-danger me-2';
            indicator.innerHTML = '<i class="fas fa-ban me-1"></i>Offline Mode';
            showPwaToast('You are currently offline. Changes will be saved locally in PWA queue.', 'warning');
        }
    }
}

function showPwaToast(message, type = 'info') {
    let toastContainer = document.getElementById('pwaToastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'pwaToastContainer';
        toastContainer.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; max-width: 360px;';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-success text-white' : type === 'warning' ? 'bg-warning text-dark' : type === 'danger' ? 'bg-danger text-white' : 'bg-primary text-white';
    toast.className = `p-3 rounded-3 shadow-lg ${bgClass} d-flex align-items-center justify-content-between text-break fs-7`;
    toast.innerHTML = `
        <div><i class="fas fa-bell me-2"></i>${message}</div>
        <button type="button" class="btn-close btn-close-white ms-2" onclick="this.parentElement.remove()"></button>
    `;

    toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 4500);
}

// ----------------------------------------------------
// 5. Official Native PWA Installation Engine (beforeinstallprompt)
// ----------------------------------------------------
function initInstallPrompt() {
    // Check if app is already running in Native Standalone PWA Window Mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true ||
                         document.referrer.includes('android-app://');

    if (isStandalone) {
        console.log('[PWA Engine] Running in Native Standalone PWA Window Mode');
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) installBtn.classList.add('d-none');
        
        // Show App Window badge on topbar
        const netIndicator = document.getElementById('pwaNetworkStatusIndicator');
        if (netIndicator && navigator.onLine) {
            netIndicator.className = 'badge bg-primary-subtle text-primary border border-primary me-1';
            netIndicator.innerHTML = '<i class="fas fa-desktop me-1"></i>App Window';
        }
        return;
    }

    // Listen for official Native Browser Install Prompt
    window.addEventListener('beforeinstallprompt', event => {
        // Prevent default browser banner
        event.preventDefault();
        // Stash the event so it can be triggered directly by clicking Install App
        deferredInstallPrompt = event;

        console.log('[PWA Engine] Official native beforeinstallprompt captured and ready');

        // Reveal the Install App button on topbar
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) {
            installBtn.classList.remove('d-none');
        }
    });

    // Listen for successful PWA installation
    window.addEventListener('appinstalled', () => {
        console.log('[PWA Engine] Jojo ERP PWA installed successfully');
        deferredInstallPrompt = null;

        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) installBtn.classList.add('d-none');

        showPwaToast('Application installed successfully! Launching native app window...', 'success');
    });

    // iOS Safari detection (only if beforeinstallprompt unavailable)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && !isStandalone) {
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) {
            installBtn.classList.remove('d-none');
        }
    }
}

// Invoked directly when user clicks "Install App"
async function triggerPwaInstall() {
    // 1. Official Browser Native Installation Flow
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
            console.log('[PWA Engine] User accepted native PWA install prompt');
            showPwaToast('Installing Jojo ERP application...', 'success');
        } else {
            console.log('[PWA Engine] User dismissed native PWA install prompt');
        }
        deferredInstallPrompt = null;
        return;
    }

    // 2. Interactive PWA Installation Guide Modal Fallback
    showInstallGuideModal();
}

function showInstallGuideModal() {
    let modalElem = document.getElementById('pwaInstallGuideModal');
    if (!modalElem) {
        modalElem = document.createElement('div');
        modalElem.id = 'pwaInstallGuideModal';
        modalElem.className = 'modal fade';
        modalElem.tabIndex = -1;
        modalElem.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg rounded-4">
                    <div class="modal-header bg-primary text-white py-3">
                        <h5 class="modal-title fw-bold"><i class="fas fa-download me-2"></i>Install Jojo ERP App</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4 text-dark">
                        <p class="mb-3 text-secondary fs-7">Install <strong>Jojo ERP</strong> on your desktop or mobile device for 1-click access, full offline capabilities, and instant sync:</p>
                        
                        <div class="list-group list-group-flush mb-3">
                            <div class="list-group-item px-0 py-2 border-0 d-flex align-items-start gap-3">
                                <span class="badge bg-primary rounded-circle p-2 fs-7"><i class="fab fa-chrome"></i></span>
                                <div>
                                    <strong class="d-block text-dark fs-7">Desktop (Chrome / Edge / Brave / Opera)</strong>
                                    <span class="fs-8 text-muted">Click the <strong>Install Icon</strong> <i class="fas fa-desktop text-primary ms-1"></i> inside your browser address bar at top right.</span>
                                </div>
                            </div>
                            <div class="list-group-item px-0 py-2 border-0 d-flex align-items-start gap-3">
                                <span class="badge bg-success rounded-circle p-2 fs-7"><i class="fab fa-android"></i></span>
                                <div>
                                    <strong class="d-block text-dark fs-7">Android Phone</strong>
                                    <span class="fs-8 text-muted">Tap browser 3 dots menu <i class="fas fa-ellipsis-v ms-1"></i> -> select <strong>"Install App"</strong> or <strong>"Add to Home Screen"</strong>.</span>
                                </div>
                            </div>
                            <div class="list-group-item px-0 py-2 border-0 d-flex align-items-start gap-3">
                                <span class="badge bg-dark rounded-circle p-2 fs-7"><i class="fab fa-apple"></i></span>
                                <div>
                                    <strong class="d-block text-dark fs-7">iPhone / iPad (Safari)</strong>
                                    <span class="fs-8 text-muted">Tap Share icon <i class="fas fa-share-alt text-primary ms-1"></i> at bottom -> select <strong>"Add to Home Screen"</strong>.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer bg-light border-0 py-2">
                        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Close Guide</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalElem);
    }
    const bsModal = new bootstrap.Modal(modalElem);
    bsModal.show();
}

// Native Web Share API helper
function shareCurrentPage(title, text) {
    if (navigator.share) {
        navigator.share({
            title: title || document.title,
            text: text || 'Jojo Production ERP Document',
            url: window.location.href
        }).catch(err => console.log('Share dismissed'));
    } else {
        navigator.clipboard.writeText(window.location.href);
        showPwaToast('Page URL copied to clipboard!', 'success');
    }
}
