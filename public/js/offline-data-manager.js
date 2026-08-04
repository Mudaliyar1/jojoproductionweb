/**
 * Jojo's Production - Offline Data Manager v2
 * Reads pendingActions from IndexedDB and injects offline-created records into
 * list pages so they appear immediately even without internet.
 *
 * Field names match the actual editor.ejs/clients form/services form name attributes:
 *   Invoice/Estimate: clientName, clientMobile, grandTotal, balanceDue, advancePaid
 *   Client: name, mobile, email, eventName, venue, city, state
 *   Service: name, category, priceType, defaultPrice, maxPrice, gstPercent, unit, status
 */

// Wait for pwa-engine.js to initialize the DB, then inject
document.addEventListener('DOMContentLoaded', () => {
    // Use shared DB from pwa-engine.js if available, else open our own
    const tryInject = (attempt) => {
        if (window.jojoOfflineDB || attempt > 10) {
            injectOfflineData();
            return;
        }
        setTimeout(() => tryInject(attempt + 1), 300);
    };
    tryInject(0);
});

async function getDB() {
    if (window.jojoOfflineDB) return window.jojoOfflineDB;
    return new Promise((resolve) => {
        const req = indexedDB.open('JojoAdminDB', 2);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => resolve(null);
        req.onupgradeneeded = e => {
            const dbRef = e.target.result;
            if (!dbRef.objectStoreNames.contains('pendingActions')) {
                dbRef.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function getAllPending() {
    const db = await getDB();
    if (!db) return [];
    return new Promise(resolve => {
        try {
            const tx = db.transaction(['pendingActions'], 'readonly');
            const store = tx.objectStore('pendingActions');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        } catch(e) { resolve([]); }
    });
}

async function injectOfflineData() {
    const pending = await getAllPending();
    if (!pending || pending.length === 0) return;

    const path = window.location.pathname;

    if (path.includes('/invoices') && !path.includes('/edit') && !path.includes('/create')) {
        injectOfflineInvoices(pending);
    }
    if (path.includes('/estimates') && !path.includes('/edit') && !path.includes('/create')) {
        injectOfflineEstimates(pending);
    }
    if (path.includes('/clients')) {
        injectOfflineClients(pending);
    }
    if (path.includes('/services')) {
        injectOfflineServices(pending);
    }
}

// ──────────────────────────────────────────────
// INVOICES — field names from editor.ejs: clientName, clientMobile, grandTotal, advancePaid, balanceDue
// ──────────────────────────────────────────────
function injectOfflineInvoices(pending) {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;

    const offlineInvoices = pending.filter(p => p.entityType === 'invoice' || (p.url && p.url.includes('/invoices/save')));
    if (offlineInvoices.length === 0) return;

    // Remove the "no invoices" placeholder row if present
    tbody.querySelectorAll('td[colspan]').forEach(td => td.closest('tr').remove());

    offlineInvoices.forEach(item => {
        const d = parseBody(item.body);
        const grandTotal   = parseFloat(d.grandTotal || 0);
        const advancePaid  = parseFloat(d.advancePaid || 0);
        const balanceDue   = parseFloat(d.balanceDue || (grandTotal - advancePaid));
        const clientName   = d.clientName || d.cName || '—';
        const clientMobile = d.clientMobile || d.cMobile || '';
        const invNum       = d.invoiceNumber || d.autoDocNum || 'OFFLINE-DRAFT';
        const invDate      = d.invoiceDate
            ? new Date(d.invoiceDate).toLocaleDateString('en-IN')
            : new Date().toLocaleDateString('en-IN');
        const status       = d.status || 'Draft';

        const tr = document.createElement('tr');
        tr.className = 'table-warning border-warning';
        tr.dataset.offlinePending = 'true';
        tr.innerHTML = `
            <td>
                <span class="fw-bold text-dark">${esc(invNum)}</span>
                <div class="mt-1"><span class="badge bg-warning text-dark border border-warning" style="font-size:0.65rem">
                    <i class="fas fa-clock me-1"></i>Pending Sync
                </span></div>
            </td>
            <td>
                <div>${esc(invDate)}</div>
                <small class="text-muted">Due: N/A</small>
            </td>
            <td>
                <div class="fw-semibold text-dark">${esc(clientName)}</div>
                <small class="text-muted">${esc(clientMobile)}</small>
            </td>
            <td class="fw-bold text-dark">₹${fmt(grandTotal)}</td>
            <td class="text-success fw-semibold">₹${fmt(advancePaid)}</td>
            <td class="fw-bold text-danger">₹${fmt(balanceDue)}</td>
            <td><span class="badge bg-warning-subtle text-warning border">${esc(status)}</span></td>
            <td class="text-end">
                <div class="d-flex gap-1 justify-content-end align-items-center">
                    <span class="badge bg-warning text-dark border me-1" style="font-size:0.6rem"><i class="fas fa-clock me-1"></i>Syncing</span>
                    <button type="button" class="btn btn-sm btn-outline-danger" title="Remove this offline draft"
                        onclick="removeOfflineDraft(${item.id}, this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>`;
        tbody.prepend(tr);
    });

    showBanner('invoices', offlineInvoices.length);
}

// ──────────────────────────────────────────────
// ESTIMATES — same field names as invoices
// ──────────────────────────────────────────────
function injectOfflineEstimates(pending) {
    const tbody = document.getElementById('estimatesTableBody');
    if (!tbody) return;

    const offlineEstimates = pending.filter(p => p.entityType === 'estimate' || (p.url && p.url.includes('/estimates/save')));
    if (offlineEstimates.length === 0) return;

    tbody.querySelectorAll('td[colspan]').forEach(td => td.closest('tr').remove());

    offlineEstimates.forEach(item => {
        const d = parseBody(item.body);
        const grandTotal   = parseFloat(d.grandTotal || 0);
        const clientName   = d.clientName || d.cName || '—';
        const clientMobile = d.clientMobile || d.cMobile || '';
        const estNum       = d.estimateNumber || d.autoDocNum || 'OFFLINE-DRAFT';
        const estDate      = d.estimateDate
            ? new Date(d.estimateDate).toLocaleDateString('en-IN')
            : new Date().toLocaleDateString('en-IN');

        const tr = document.createElement('tr');
        tr.className = 'table-warning border-warning';
        tr.dataset.offlinePending = 'true';
        tr.innerHTML = `
            <td>
                <span class="fw-bold text-primary">${esc(estNum)}</span>
                <span class="badge bg-light text-muted border ms-1">v1</span>
                <div class="mt-1"><span class="badge bg-warning text-dark border border-warning" style="font-size:0.65rem">
                    <i class="fas fa-clock me-1"></i>Pending Sync
                </span></div>
            </td>
            <td>${esc(estDate)}</td>
            <td>
                <div class="fw-semibold text-dark">${esc(clientName)}</div>
                <small class="text-muted">${esc(clientMobile)}</small>
            </td>
            <td>—</td>
            <td><span class="fw-bold text-dark">₹${fmt(grandTotal)}</span></td>
            <td><span class="badge bg-warning-subtle text-warning border">Draft</span></td>
            <td class="text-end">
                <div class="d-flex gap-1 justify-content-end align-items-center">
                    <span class="badge bg-warning text-dark border me-1" style="font-size:0.6rem"><i class="fas fa-clock me-1"></i>Syncing</span>
                    <button type="button" class="btn btn-sm btn-outline-danger" title="Remove this offline draft"
                        onclick="removeOfflineDraft(${item.id}, this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>`;
        tbody.prepend(tr);
    });

    showBanner('estimates', offlineEstimates.length);
}

// ──────────────────────────────────────────────
// CLIENTS — field names: name, mobile, email, eventName, venue, city, state
// ──────────────────────────────────────────────
function injectOfflineClients(pending) {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    const offlineClients = pending.filter(p => p.entityType === 'client' || (p.url && p.url.includes('/clients/')));
    if (offlineClients.length === 0) return;

    tbody.querySelectorAll('td[colspan]').forEach(td => td.closest('tr').remove());

    offlineClients.forEach(item => {
        const d = parseBody(item.body);
        const name      = d.name || '—';
        const mobile    = d.mobile || '—';
        const email     = d.email || '';
        const eventName = d.eventName || '—';
        const venue     = d.venue || '';
        const city      = d.city || '';
        const state     = d.state || '';

        const tr = document.createElement('tr');
        tr.className = 'table-warning border-warning';
        tr.dataset.offlinePending = 'true';
        tr.innerHTML = `
            <td>
                <div class="fw-bold text-dark">${esc(name)}</div>
                <span class="badge bg-warning text-dark border border-warning mt-1" style="font-size:0.65rem">
                    <i class="fas fa-clock me-1"></i>Pending Sync
                </span>
            </td>
            <td>
                <div><i class="fas fa-phone-alt me-1 text-muted" style="font-size:0.7rem"></i>${esc(mobile)}</div>
                ${email ? `<small class="text-muted">${esc(email)}</small>` : ''}
            </td>
            <td>
                <div class="fw-semibold text-primary">${esc(eventName)}</div>
                ${venue ? `<div class="text-muted" style="font-size:0.75rem"><i class="fas fa-map-marker-alt me-1"></i>${esc(venue)}</div>` : ''}
            </td>
            <td>${esc(city)}${state ? ', ' + esc(state) : ''}</td>
            <td class="text-end">
                <div class="d-flex gap-1 justify-content-end">
                    <span class="badge bg-warning text-dark border me-1" style="font-size:0.6rem"><i class="fas fa-clock me-1"></i>Syncing</span>
                    <button type="button" class="btn btn-sm btn-outline-danger" title="Remove this offline draft"
                        onclick="removeOfflineDraft(${item.id}, this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>`;
        tbody.prepend(tr);
    });

    showBanner('clients', offlineClients.length);
}

// ──────────────────────────────────────────────
// SERVICES — field names: name, category, priceType, defaultPrice, maxPrice, gstPercent, unit, status, description
// ──────────────────────────────────────────────
function injectOfflineServices(pending) {
    const tbody = document.getElementById('servicesTableBody');
    if (!tbody) return;

    const offlineServices = pending.filter(p => p.entityType === 'service' || (p.url && p.url.includes('/services/')));
    if (offlineServices.length === 0) return;

    tbody.querySelectorAll('td[colspan]').forEach(td => td.closest('tr').remove());

    offlineServices.forEach(item => {
        const d = parseBody(item.body);
        const name         = d.name || '—';
        const category     = d.category || 'Production';
        const priceType    = d.priceType || 'fixed';
        const defaultPrice = parseFloat(d.defaultPrice || d.price || 0);
        const maxPrice     = parseFloat(d.maxPrice || 0);
        const gstPercent   = d.gstPercent || d.gstRate || '18';
        const unit         = d.unit || 'Event';
        const status       = d.status || 'active';
        const description  = d.description || '';

        const tr = document.createElement('tr');
        tr.className = 'table-warning border-warning';
        tr.dataset.offlinePending = 'true';
        tr.innerHTML = `
            <td>
                <div class="fw-bold text-dark">${esc(name)}</div>
                <small class="text-muted">${esc(description)}</small>
                <div class="mt-1"><span class="badge bg-warning text-dark border border-warning" style="font-size:0.65rem">
                    <i class="fas fa-clock me-1"></i>Pending Sync
                </span></div>
            </td>
            <td><span class="badge bg-light text-secondary border">${esc(category)}</span></td>
            <td>
                ${priceType === 'range'
                    ? `<span class="fw-bold text-success">₹${fmt(defaultPrice)} – ₹${fmt(maxPrice)}</span> <span class="badge bg-info-subtle text-info border ms-1">Range</span>`
                    : `<span class="fw-bold text-dark">₹${fmt(defaultPrice)}</span> <span class="badge bg-secondary-subtle text-secondary border ms-1">Fixed</span>`
                }
            </td>
            <td>${esc(String(gstPercent))}%</td>
            <td>${esc(unit)}</td>
            <td><span class="badge bg-${status === 'active' ? 'success-subtle text-success' : 'danger-subtle text-danger'}">${esc(status)}</span></td>
            <td class="text-end">
                <div class="d-flex gap-1 justify-content-end">
                    <span class="badge bg-warning text-dark border me-1" style="font-size:0.6rem"><i class="fas fa-clock me-1"></i>Syncing</span>
                    <button type="button" class="btn btn-sm btn-outline-danger" title="Remove this offline draft"
                        onclick="removeOfflineDraft(${item.id}, this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>`;
        tbody.prepend(tr);
    });

    showBanner('services', offlineServices.length);
}

// ──────────────────────────────────────────────
// Offline Banner Notice
// ──────────────────────────────────────────────
function showBanner(type, count) {
    const bannerId = `offlineBanner_${type}`;
    if (document.getElementById(bannerId)) return;
    const banner = document.createElement('div');
    banner.id = bannerId;
    banner.className = 'alert alert-warning d-flex align-items-center gap-2 mb-3 border border-warning shadow-sm rounded-3';
    banner.innerHTML = `
        <i class="fas fa-satellite-dish fa-lg text-warning flex-shrink-0"></i>
        <div>
            <strong>Offline Mode Active:</strong> ${count} ${type} record${count > 1 ? 's' : ''} saved locally (highlighted in yellow).
            <span class="text-muted ms-1 d-block d-sm-inline">They will sync automatically when internet returns.</span>
        </div>`;
    // Insert before first card / table on page
    const target = document.querySelector('.card, .table-responsive');
    if (target && target.parentNode) {
        target.parentNode.insertBefore(banner, target);
    } else {
        const main = document.querySelector('main, .container-fluid');
        if (main) main.prepend(banner);
    }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function parseBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch(e) { return {}; }
    }
    return body;
}

// ──────────────────────────────────────────────
// Remove Offline Draft from IndexedDB
// ──────────────────────────────────────────────
async function removeOfflineDraft(pendingId, btn) {
    if (!confirm('Remove this offline draft? It will NOT be synced to the server.')) return;
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(['pendingActions'], 'readwrite');
    tx.objectStore('pendingActions').delete(pendingId);
    tx.oncomplete = () => {
        // Fade out and remove the row
        const row = btn.closest('tr');
        if (row) {
            row.style.transition = 'opacity 0.4s';
            row.style.opacity = '0';
            setTimeout(() => row.remove(), 400);
        }
        // Update badge count
        if (typeof updateOfflineBadgeCount === 'function') updateOfflineBadgeCount();
    };
}

function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmt(num) {
    return (parseFloat(num) || 0).toLocaleString('en-IN');
}
