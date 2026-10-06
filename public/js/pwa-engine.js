/**
 * Jojo's Production Admin - PWA Engine (Online-Only Architecture)
 * Handles PWA Service Worker Registration, Native PWA Installation, and Network Status Monitoring.
 * IndexedDB business data caching and offline sync queues have been completely removed.
 */

let deferredInstallPrompt = null;
let ws = null;

document.addEventListener('DOMContentLoaded', function() {
    purgeLegacyOfflineDatabases();
    initServiceWorker();
    initNetworkMonitor();
    initWebSocketSync();
    initInstallPrompt();
});

// ----------------------------------------------------
// 1. One-Time Legacy Browser IndexedDB Purge
// ----------------------------------------------------
function purgeLegacyOfflineDatabases() {
    const legacyDBs = ['JojoAdminDB', 'JojoOfflineTicketsDB', 'JojoGateScannerDB', 'JojoERP_OfflineDB', 'JojoInvoiceSystemDB'];
    legacyDBs.forEach(dbName => {
        try {
            const req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => console.log(`[PWA Engine] Purged legacy offline database: ${dbName}`);
            req.onerror = () => {};
        } catch(e) {}
    });
}

// ----------------------------------------------------
// 2. Service Worker Initialization
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
                            showPwaToast('New system version installed! Refresh page to update.', 'info');
                        }
                    };
                };
            })
            .catch(err => console.error('[PWA Engine] ServiceWorker registration failed:', err));
    }
}

// ----------------------------------------------------
// 3. Network Status Monitor & Indicators
// ----------------------------------------------------
function initNetworkMonitor() {
    window.addEventListener('online', () => updateNetworkStatusUI(true));
    window.addEventListener('offline', () => updateNetworkStatusUI(false));
    updateNetworkStatusUI(navigator.onLine);
}

function updateNetworkStatusUI(isOnline) {
    const indicator = document.getElementById('pwaNetworkStatusIndicator');
    if (!indicator) return;

    if (!isOnline) {
        indicator.className = 'badge bg-danger-subtle text-danger border border-danger me-1';
        indicator.innerHTML = '<i class="fas fa-wifi-slash me-1"></i>Offline';
    } else {
        indicator.className = 'badge bg-success-subtle text-success border border-success me-1';
        indicator.innerHTML = '<i class="fas fa-wifi me-1"></i>Online';
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
    const bgClass = type === 'success' ? 'bg-success text-white' : type === 'warning' ? 'bg-warning text-dark' : type === 'danger' ? 'bg-danger text-white' : 'bg-dark text-white';
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
// 4. Real-Time WebSocket Connection
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
                handleRealtimeMutation(data);
            } catch(e) {}
        };

        ws.onclose = () => {
            setTimeout(initWebSocketSync, 5000);
        };
    } catch(e) {}
}

function handleRealtimeMutation(data) {
    if (!data || !data.type) return;

    if (data.type === 'ATTENDANCE_CHECKIN') {
        const countElem = document.getElementById('scannedCountVal');
        if (countElem && typeof data.checkedInTickets === 'number') {
            countElem.textContent = data.checkedInTickets;
        }
    }
}

// ----------------------------------------------------
// 5. Official Native PWA Installation Engine
// ----------------------------------------------------
function initInstallPrompt() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true ||
                         document.referrer.includes('android-app://');

    if (isStandalone) {
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) installBtn.classList.add('d-none');
        return;
    }

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredInstallPrompt = event;

        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) {
            installBtn.classList.remove('d-none');
        }
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) installBtn.classList.add('d-none');
        showPwaToast('Application installed successfully!', 'success');
    });

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && !isStandalone) {
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) {
            installBtn.classList.remove('d-none');
        }
    }
}

async function triggerPwaInstall() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
            showPwaToast('Installing Jojo ERP application...', 'success');
        }
        deferredInstallPrompt = null;
        return;
    }
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
                    <div class="modal-header bg-dark text-white py-3">
                        <h5 class="modal-title fw-bold"><i class="fas fa-download me-2"></i>Install Jojo ERP App</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4 text-dark">
                        <p class="mb-3 text-secondary fs-7">Install <strong>Jojo ERP</strong> on your desktop or mobile device for 1-click access:</p>
                        <div class="list-group list-group-flush mb-3">
                            <div class="list-group-item px-0 py-2 border-0 d-flex align-items-start gap-3">
                                <span class="badge bg-primary rounded-circle p-2 fs-7"><i class="fab fa-chrome"></i></span>
                                <div>
                                    <strong class="d-block text-dark fs-7">Desktop (Chrome / Edge / Brave / Opera)</strong>
                                    <span class="fs-8 text-muted">Click the <strong>Install Icon</strong> <i class="fas fa-desktop text-primary ms-1"></i> in address bar at top right.</span>
                                </div>
                            </div>
                            <div class="list-group-item px-0 py-2 border-0 d-flex align-items-start gap-3">
                                <span class="badge bg-success rounded-circle p-2 fs-7"><i class="fab fa-android"></i></span>
                                <div>
                                    <strong class="d-block text-dark fs-7">Android Phone</strong>
                                    <span class="fs-8 text-muted">Tap browser 3 dots menu <i class="fas fa-ellipsis-v ms-1"></i> -> select <strong>"Install App"</strong>.</span>
                                </div>
                            </div>
                            <div class="list-group-item px-0 py-2 border-0 d-flex align-items-start gap-3">
                                <span class="badge bg-dark rounded-circle p-2 fs-7"><i class="fab fa-apple"></i></span>
                                <div>
                                    <strong class="d-block text-dark fs-7">iPhone / iPad (Safari)</strong>
                                    <span class="fs-8 text-muted">Tap Share icon <i class="fas fa-share-alt text-primary ms-1"></i> -> select <strong>"Add to Home Screen"</strong>.</span>
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
