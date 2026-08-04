/**
 * Jojo's Production Admin - Enterprise Offline-First PWA Engine
 * Handles IndexedDB Local Database, Form Interception, Media Queue, Background Auto-Sync & Network Monitor.
 */

let deferredInstallPrompt = null;
let db = null;
let ws = null;
let isSyncingQueue = false;

document.addEventListener('DOMContentLoaded', function() {
    initIndexedDB().then(() => {
        initOfflineFormInterception();
        updateOfflineBadgeCount();
        if (navigator.onLine) {
            flushOfflineQueue();
        }
    });
    initServiceWorker();
    initNetworkMonitor();
    initWebSocketSync();
    initInstallPrompt();
});

// ----------------------------------------------------
// 1. Service Worker Initialization
// ----------------------------------------------------
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {
                console.log('[PWA Engine] ServiceWorker active with scope:', reg.scope);
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showPwaToast('New system version installed! Restart PWA to update.', 'info');
                        }
                    };
                };
            })
            .catch(err => console.error('[PWA Engine] ServiceWorker registration failed:', err));

        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'TRIGGER_BACKGROUND_SYNC') {
                flushOfflineQueue();
            }
        });
    }
}

// ----------------------------------------------------
// 2. IndexedDB Enterprise Local Database (JojoAdminDB v2)
// ----------------------------------------------------
function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('JojoAdminDB', 2);

        request.onupgradeneeded = event => {
            const dbRef = event.target.result;
            if (!dbRef.objectStoreNames.contains('pendingActions')) {
                dbRef.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
            }
            if (!dbRef.objectStoreNames.contains('offlineInvoices')) {
                dbRef.createObjectStore('offlineInvoices', { keyPath: 'id' });
            }
            if (!dbRef.objectStoreNames.contains('offlineEstimates')) {
                dbRef.createObjectStore('offlineEstimates', { keyPath: 'id' });
            }
            if (!dbRef.objectStoreNames.contains('offlineClients')) {
                dbRef.createObjectStore('offlineClients', { keyPath: 'id' });
            }
            if (!dbRef.objectStoreNames.contains('offlineServices')) {
                dbRef.createObjectStore('offlineServices', { keyPath: 'id' });
            }
            if (!dbRef.objectStoreNames.contains('cachedMetadata')) {
                dbRef.createObjectStore('cachedMetadata', { keyPath: 'key' });
            }
        };

        request.onsuccess = event => {
            db = event.target.result;
            window.jojoOfflineDB = db; // expose for offline-data-manager.js
            console.log('[PWA Engine] IndexedDB JojoAdminDB v2 initialized successfully');
            resolve(db);
        };

        request.onerror = event => {
            console.error('[PWA Engine] IndexedDB error:', event.target.error);
            resolve(null);
        };
    });
}

// Save action in IndexedDB offline queue
async function queueOfflineAction(url, method, bodyData, entityType = 'general') {
    if (!db) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['pendingActions'], 'readwrite');
        const store = tx.objectStore('pendingActions');
        const action = {
            url: url,
            method: method || 'POST',
            entityType: entityType,
            body: bodyData,
            timestamp: new Date().toISOString()
        };
        const req = store.add(action);
        req.onsuccess = () => {
            console.log('[PWA Engine] Action queued in IndexedDB:', action);
            updateOfflineBadgeCount();
            showPwaToast('Saved locally in offline queue! Will sync automatically when online.', 'warning');
            resolve(req.result);
        };
        req.onerror = () => reject(req.error);
    });
}

// Automatic Sequential Sync Engine
async function flushOfflineQueue() {
    if (!navigator.onLine || !db || isSyncingQueue) return;

    const tx = db.transaction(['pendingActions'], 'readonly');
    const store = tx.objectStore('pendingActions');
    const getAllReq = store.getAll();

    getAllReq.onsuccess = async () => {
        const pending = getAllReq.result;
        if (!pending || pending.length === 0) {
            updateNetworkStatusUI(true, false, 0);
            return;
        }

        isSyncingQueue = true;
        updateNetworkStatusUI(true, true, pending.length);
        showPwaToast(`Syncing ${pending.length} offline action(s)...`, 'info');
        let successCount = 0;

        for (let item of pending) {
            try {
                // If item has base64 media attachment, upload to server/cloudinary first
                let finalBody = item.body;
                if (typeof finalBody === 'object' && finalBody.offlineBase64Logo) {
                    try {
                        const uploadRes = await fetch('/admin/invoice-system/upload-logo-base64', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ base64Image: finalBody.offlineBase64Logo })
                        });
                        const uploadData = await uploadRes.json();
                        if (uploadData && uploadData.url) {
                            finalBody.logoUrl = uploadData.url;
                            delete finalBody.offlineBase64Logo;
                        }
                    } catch(e) {}
                }

                const res = await fetch(item.url, {
                    method: item.method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: typeof finalBody === 'string' ? finalBody : JSON.stringify(finalBody)
                });

                if (res.ok || res.status === 200 || res.status === 201) {
                    const deleteTx = db.transaction(['pendingActions'], 'readwrite');
                    deleteTx.objectStore('pendingActions').delete(item.id);
                    successCount++;
                }
            } catch (err) {
                console.error('[PWA Engine] Failed to sync item:', item, err);
            }
        }

        isSyncingQueue = false;
        await updateOfflineBadgeCount();

        if (successCount > 0) {
            showPwaToast(`✅ Synchronized ${successCount} offline record(s) to server!`, 'success');
            // Trigger WebSocket mutation broadcast if connection ready
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'OFFLINE_SYNC_COMPLETED', count: successCount }));
            }
            // Navigate to the correct list page so the synced records appear
            setTimeout(() => {
                const path = window.location.pathname;
                if (path.includes('/estimates')) {
                    window.location.href = '/admin/invoice-system/estimates';
                } else if (path.includes('/clients')) {
                    window.location.href = '/admin/invoice-system/clients';
                } else if (path.includes('/services')) {
                    window.location.href = '/admin/invoice-system/services';
                } else {
                    // Default: go to invoices list
                    window.location.href = '/admin/invoice-system/invoices';
                }
            }, 1200);
        } else {
            updateNetworkStatusUI(true, false, 0);
        }
    };
}

async function updateOfflineBadgeCount() {
    if (!db) return 0;
    return new Promise(resolve => {
        const tx = db.transaction(['pendingActions'], 'readonly');
        const store = tx.objectStore('pendingActions');
        const countReq = store.count();

        countReq.onsuccess = () => {
            const count = countReq.result;
            const badge = document.getElementById('pwaOfflineBadge');
            const settingsCount = document.getElementById('pwaSettingsPendingCount');

            if (settingsCount) {
                settingsCount.innerText = `${count} Pending`;
            }

            if (badge) {
                if (count > 0) {
                    badge.innerText = `${count} Pending`;
                    badge.classList.remove('d-none');
                } else {
                    badge.classList.add('d-none');
                }
            }

            updateNetworkStatusUI(navigator.onLine, isSyncingQueue, count);
            resolve(count);
        };
        countReq.onerror = () => resolve(0);
    });
}

// Intercept forms when offline
function initOfflineFormInterception() {
    window.addEventListener('online', () => {
        updateNetworkStatusUI(true, true);
        flushOfflineQueue();
    });

    window.addEventListener('offline', () => {
        updateNetworkStatusUI(false, false);
    });

    updateNetworkStatusUI(navigator.onLine);

    // Intercept relevant forms when offline
    // NOTE: editorForm (invoice/estimate editor) is handled directly by invoice-editor.js -> DO NOT intercept here
    document.addEventListener('submit', async function(e) {
        const form = e.target;
        const action = form.action || '';

        // ── Offline DELETE interception (invoices, estimates, clients, services) ──
        if (!navigator.onLine) {
            const isDeleteForm = action.includes('/delete/');
            if (isDeleteForm) {
                e.preventDefault();

                let deleteEntityType = 'general';
                let deleteRedirectUrl = null;
                if (action.includes('/invoices/delete/')) { deleteEntityType = 'invoice'; deleteRedirectUrl = '/admin/invoice-system/invoices'; }
                else if (action.includes('/estimates/delete/')) { deleteEntityType = 'estimate'; deleteRedirectUrl = '/admin/invoice-system/estimates'; }
                else if (action.includes('/clients/delete/')) { deleteEntityType = 'client'; deleteRedirectUrl = '/admin/invoice-system/clients'; }
                else if (action.includes('/services/delete/')) { deleteEntityType = 'service'; deleteRedirectUrl = '/admin/invoice-system/services'; }

                await queueOfflineAction(action, 'POST', {}, 'delete_' + deleteEntityType);
                showPwaToast('Deletion queued offline. Will execute when internet returns.', 'warning');

                // Instantly remove the row from the DOM for immediate feedback
                const row = form.closest('tr');
                if (row) {
                    row.style.transition = 'opacity 0.4s';
                    row.style.opacity = '0';
                    setTimeout(() => row.remove(), 400);
                }
                return;
            }
        }

        // Skip editorForm — invoice-editor.js handles it already with proper items JSON
        if (form.id === 'editorForm') return;

        const isClientForm = form.id === 'clientForm' || action.includes('/clients/save') || action.includes('/clients/create');
        const isServiceForm = form.id === 'serviceForm' || action.includes('/services/save') || action.includes('/services/create');
        const isInvoiceForm = action.includes('/invoices/save') || action.includes('/invoices/create');
        const isEstimateForm = action.includes('/estimates/save') || action.includes('/estimates/create');
        const isRelevantForm = isClientForm || isServiceForm || isInvoiceForm || isEstimateForm;

        if (!navigator.onLine && isRelevantForm) {
            e.preventDefault();

            const formData = new FormData(form);
            const dataObj = {};
            formData.forEach((val, key) => { dataObj[key] = val; });

            // Handle base64 image files if present
            const fileInputs = form.querySelectorAll('input[type="file"]');
            for (let fileInput of fileInputs) {
                if (fileInput.files && fileInput.files[0]) {
                    try {
                        dataObj.offlineBase64Logo = await readFileAsBase64(fileInput.files[0]);
                    } catch(err) {}
                }
            }

            // Determine entity type
            let entityType = 'general';
            let redirectUrl = null;

            if (isClientForm) {
                entityType = 'client';
                redirectUrl = '/admin/invoice-system/clients';
            } else if (isServiceForm) {
                entityType = 'service';
                redirectUrl = '/admin/invoice-system/services';
            } else if (isEstimateForm || (isEditorForm && action.includes('estimate'))) {
                entityType = 'estimate';
                redirectUrl = '/admin/invoice-system/estimates';
            } else if (isInvoiceForm || isEditorForm) {
                entityType = 'invoice';
                redirectUrl = '/admin/invoice-system/invoices';
            }

            await queueOfflineAction(action, 'POST', dataObj, entityType);

            // Close modal if open (for client/service modal forms)
            if (isClientForm || isServiceForm) {
                document.querySelectorAll('.modal.show').forEach(m => {
                    const bsModal = bootstrap.Modal.getInstance(m);
                    if (bsModal) bsModal.hide();
                });
            }

            // Redirect to the list to show the pending item
            setTimeout(() => {
                if (redirectUrl) {
                    window.location.href = redirectUrl;
                } else {
                    window.location.reload();
                }
            }, 800);
        }
    });
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// ----------------------------------------------------
// 3. Network Status Monitor & Indicators
// ----------------------------------------------------
function initNetworkMonitor() {
    window.addEventListener('online', () => updateNetworkStatusUI(true));
    window.addEventListener('offline', () => updateNetworkStatusUI(false));
}

function updateNetworkStatusUI(isOnline, isSyncing = false, pendingCount = 0) {
    const indicator = document.getElementById('pwaNetworkStatusIndicator');
    if (!indicator) return;

    if (!isOnline) {
        indicator.className = 'badge bg-warning text-dark border border-warning me-1';
        indicator.innerHTML = `<i class="fas fa-wifi-slash me-1"></i>Working Offline (${pendingCount} Pending)`;
    } else if (isSyncing || isSyncingQueue) {
        indicator.className = 'badge bg-primary-subtle text-primary border border-primary me-1';
        indicator.innerHTML = `<i class="fas fa-sync fa-spin me-1"></i>Synchronizing (${pendingCount} Left)...`;
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
// 4. Real-Time WebSocket Synchronization
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

    if (data.type === 'INVOICE_MUTATION' || data.type === 'ESTIMATE_MUTATION' || data.type === 'CLIENT_MUTATION') {
        showPwaToast(`Real-time update: ${data.action} ${data.docType || 'record'} ${data.number || ''}`, 'info');
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
        
        const netIndicator = document.getElementById('pwaNetworkStatusIndicator');
        if (netIndicator && navigator.onLine) {
            netIndicator.className = 'badge bg-primary-subtle text-primary border border-primary me-1';
            netIndicator.innerHTML = '<i class="fas fa-desktop me-1"></i>App Window';
        }
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

function shareCurrentPage(title, text) {
    if (navigator.share) {
        navigator.share({
            title: title || document.title,
            text: text || 'Jojo Production ERP Document',
            url: window.location.href
        }).catch(err => {});
    } else {
        navigator.clipboard.writeText(window.location.href);
        showPwaToast('Page URL copied to clipboard!', 'success');
    }
}
