/**
 * Invoice System - Interactive Live Canvas Document Editor & Calculation Engine
 */

let calcMode = 'auto';
let copiedRowData = null;

document.addEventListener('DOMContentLoaded', function() {
    initEditorEvents();
    const gstSelect = document.getElementById('inputGstEnabled');
    if (gstSelect) {
        onGstToggleChange(gstSelect);
    } else {
        recalculateTotals();
    }
});

function initEditorEvents() {
    // Bind change listeners on all input fields inside items table
    const tableBody = document.getElementById('editorItemsBody');
    if (tableBody) {
        tableBody.addEventListener('input', function(e) {
            if (calcMode === 'auto') {
                recalculateTotals();
            }
        });
    }

    // Auto fill client details when selected
    const clientSelect = document.getElementById('clientSelector');
    if (clientSelect) {
        clientSelect.addEventListener('change', function() {
            const opt = this.options[this.selectedIndex];
            if (opt && opt.value) {
                const c = JSON.parse(opt.dataset.client || '{}');
                document.getElementById('cNameInput').value = c.name || '';
                document.getElementById('cMobileInput').value = c.mobile || '';
                document.getElementById('cEmailInput').value = c.email || '';
                document.getElementById('cAddressInput').value = c.address || '';
                document.getElementById('cEventNameInput').value = c.eventName || '';
                if (c.eventDate) {
                    document.getElementById('cEventDateInput').value = c.eventDate.split('T')[0];
                }
                document.getElementById('cVenueInput').value = c.venue || '';
            }
        });
    }
}

// Service Selector Handler
function onServiceSelect(selectElem) {
    const opt = selectElem.options[selectElem.selectedIndex];
    if (opt && opt.value) {
        const s = JSON.parse(opt.dataset.service || '{}');
        const tr = selectElem.closest('tr');
        if (tr) {
            tr.querySelector('.item-desc').value = s.name + (s.description ? ' - ' + s.description : '');
            tr.querySelector('.item-unit').value = s.unit || 'Event';
            tr.querySelector('.item-rate').value = s.defaultPrice || 0;
            tr.querySelector('.item-maxrate').value = s.maxPrice || 0;
            tr.querySelector('.item-pricetype').value = s.priceType || 'fixed';
            tr.querySelector('.item-gst').value = s.gstPercent || 18;
            toggleRowRangeFields(tr);
            recalculateTotals();
        }
    }
}

function toggleRowRangeFields(tr) {
    const type = tr.querySelector('.item-pricetype').value;
    const maxRateInput = tr.querySelector('.item-maxrate');
    if (type === 'range') {
        maxRateInput.classList.remove('d-none');
        maxRateInput.style.display = 'inline-block';
        maxRateInput.placeholder = 'Max Rate';
    } else {
        maxRateInput.classList.add('d-none');
        maxRateInput.style.display = 'none';
        maxRateInput.value = 0;
    }
}

// Add New Service Row
function addServiceRow(trTarget = null, position = 'below') {
    const tableBody = document.getElementById('editorItemsBody');
    const templateRow = document.getElementById('rowTemplate');
    const clone = templateRow.content.cloneNode(true);
    const newTr = clone.querySelector('tr');

    const gstSelect = document.getElementById('inputGstEnabled');
    if (gstSelect && gstSelect.value === 'false') {
        const gstInput = newTr.querySelector('.item-gst');
        if (gstInput) {
            gstInput.value = '0';
            gstInput.disabled = true;
            gstInput.classList.add('bg-danger-subtle', 'text-danger', 'fw-bold');
        }
    }

    if (trTarget) {
        if (position === 'above') {
            trTarget.parentNode.insertBefore(newTr, trTarget);
        } else {
            trTarget.parentNode.insertBefore(newTr, trTarget.nextSibling);
        }
    } else {
        tableBody.appendChild(newTr);
    }
    updateRowNumbers();
    recalculateTotals();
}

function removeServiceRow(btn) {
    const tr = btn.closest('tr');
    const tableBody = document.getElementById('editorItemsBody');
    if (tableBody.querySelectorAll('tr').length > 1) {
        tr.remove();
        updateRowNumbers();
        recalculateTotals();
    } else {
        alert('At least one item row is required.');
    }
}

function duplicateRow(btn) {
    const tr = btn.closest('tr');
    const clone = tr.cloneNode(true);
    tr.parentNode.insertBefore(clone, tr.nextSibling);
    updateRowNumbers();
    recalculateTotals();
}

function copyRow(btn) {
    const tr = btn.closest('tr');
    copiedRowData = {
        desc: tr.querySelector('.item-desc').value,
        qty: tr.querySelector('.item-qty').value,
        unit: tr.querySelector('.item-unit').value,
        rate: tr.querySelector('.item-rate').value,
        maxRate: tr.querySelector('.item-maxrate').value,
        priceType: tr.querySelector('.item-pricetype').value,
        gst: tr.querySelector('.item-gst').value
    };
    alert('Row copied to clipboard');
}

function pasteRow(btn) {
    if (!copiedRowData) {
        alert('No row copied yet!');
        return;
    }
    const tr = btn.closest('tr');
    tr.querySelector('.item-desc').value = copiedRowData.desc;
    tr.querySelector('.item-qty').value = copiedRowData.qty;
    tr.querySelector('.item-unit').value = copiedRowData.unit;
    tr.querySelector('.item-rate').value = copiedRowData.rate;
    tr.querySelector('.item-maxrate').value = copiedRowData.maxRate;
    tr.querySelector('.item-pricetype').value = copiedRowData.priceType;
    tr.querySelector('.item-gst').value = copiedRowData.gst;
    toggleRowRangeFields(tr);
    recalculateTotals();
}

function updateRowNumbers() {
    const rows = document.querySelectorAll('#editorItemsBody tr');
    rows.forEach((tr, index) => {
        const numSpan = tr.querySelector('.row-num');
        if (numSpan) numSpan.innerText = index + 1;
    });
}

// Live Calculations Engine
function recalculateTotals() {
    if (calcMode === 'manual') return;

    let subtotalMin = 0;
    let subtotalMax = 0;
    let totalGst = 0;
    let hasRange = false;

    const inputGstEnabled = document.getElementById('inputGstEnabled');
    const isGstActive = inputGstEnabled ? (inputGstEnabled.value === 'true') : true;

    const rows = document.querySelectorAll('#editorItemsBody tr');
    rows.forEach(tr => {
        const qty = parseFloat(tr.querySelector('.item-qty')?.value || 0);
        const rate = parseFloat(tr.querySelector('.item-rate')?.value || 0);
        const maxRate = parseFloat(tr.querySelector('.item-maxrate')?.value || 0);
        const priceType = tr.querySelector('.item-pricetype')?.value || 'fixed';
        const gstPercent = parseFloat(tr.querySelector('.item-gst')?.value || 0);

        let rowMinAmt = qty * rate;
        let rowMaxAmt = (priceType === 'range' && maxRate > 0) ? (qty * maxRate) : rowMinAmt;

        if (priceType === 'range' && maxRate > 0) hasRange = true;

        const rowGst = isGstActive ? ((rowMinAmt * gstPercent) / 100) : 0;
        totalGst += rowGst;

        subtotalMin += rowMinAmt;
        subtotalMax += rowMaxAmt;

        // Update row total text
        const totalCell = tr.querySelector('.item-total-text');
        if (totalCell) {
            if (priceType === 'range' && maxRate > 0) {
                totalCell.innerText = `₹${rowMinAmt.toLocaleString('en-IN')} - ₹${rowMaxAmt.toLocaleString('en-IN')}`;
            } else {
                totalCell.innerText = `₹${rowMinAmt.toLocaleString('en-IN')}`;
            }
        }
    });

    const discountVal = parseFloat(document.getElementById('inputDiscount')?.value || 0);
    const transportVal = parseFloat(document.getElementById('inputTransport')?.value || 0);
    const advanceVal = parseFloat(document.getElementById('inputAdvance')?.value || 0);

    const grandTotalMin = Math.max(0, subtotalMin - discountVal + totalGst + transportVal);
    const grandTotalMax = Math.max(0, subtotalMax - discountVal + totalGst + transportVal);

    // Update form input values
    const elSubtotal = document.getElementById('inputSubtotal');
    if (elSubtotal) elSubtotal.value = subtotalMin.toFixed(2);

    const elMinTotal = document.getElementById('inputMinTotal');
    if (elMinTotal) elMinTotal.value = subtotalMin.toFixed(2);

    const elMaxTotal = document.getElementById('inputMaxTotal');
    if (elMaxTotal) elMaxTotal.value = subtotalMax.toFixed(2);

    const elGstTotal = document.getElementById('inputGstTotal');
    if (elGstTotal) elGstTotal.value = totalGst.toFixed(2);

    const elCgst = document.getElementById('inputCgst');
    if (elCgst) elCgst.value = (totalGst / 2).toFixed(2);

    const elSgst = document.getElementById('inputSgst');
    if (elSgst) elSgst.value = (totalGst / 2).toFixed(2);

    const elGrandTotal = document.getElementById('inputGrandTotal');
    if (elGrandTotal) elGrandTotal.value = grandTotalMin.toFixed(2);

    const balanceDue = Math.max(0, grandTotalMin - advanceVal);
    const elBalance = document.getElementById('inputBalanceDue');
    if (elBalance) elBalance.value = balanceDue.toFixed(2);

    // Optional Range Display Text
    const dispGrandTotal = document.getElementById('dispGrandTotal');
    if (dispGrandTotal) {
        if (hasRange && subtotalMin !== subtotalMax) {
            dispGrandTotal.innerText = `Estimate Range: ₹${grandTotalMin.toLocaleString('en-IN')} - ₹${grandTotalMax.toLocaleString('en-IN')}`;
        } else {
            dispGrandTotal.innerText = '';
        }
    }
}

// Toggle GST Mode (Enable vs Disable Dropdown)
function onGstToggleChange(selectElem) {
    const isEnabled = selectElem.value === 'true';
    const gstRow = document.getElementById('rowGstTax');
    const taxIcon = document.getElementById('taxModeIcon');

    if (isEnabled) {
        selectElem.className = 'form-select form-select-sm fw-bold text-success border-success';
        if (taxIcon) taxIcon.className = 'fas fa-percent me-1 text-success';
        if (gstRow) gstRow.classList.remove('d-none');
    } else {
        selectElem.className = 'form-select form-select-sm fw-bold text-danger border-danger';
        if (taxIcon) taxIcon.className = 'fas fa-ban me-1 text-danger';
        if (gstRow) gstRow.classList.add('d-none');
    }

    // Toggle GST % inputs in table
    const rows = document.querySelectorAll('#editorItemsBody tr');
    rows.forEach(tr => {
        const gstInput = tr.querySelector('.item-gst');
        if (gstInput) {
            if (!isEnabled) {
                if (gstInput.value && gstInput.value !== '0') {
                    gstInput.dataset.prevGst = gstInput.value;
                }
                gstInput.value = '0';
                gstInput.disabled = true;
                gstInput.classList.add('bg-danger-subtle', 'text-danger', 'fw-bold');
            } else {
                gstInput.disabled = false;
                gstInput.classList.remove('bg-danger-subtle', 'text-danger', 'fw-bold');
                if (gstInput.value === '0' && gstInput.dataset.prevGst) {
                    gstInput.value = gstInput.dataset.prevGst;
                } else if (gstInput.value === '0') {
                    gstInput.value = '18';
                }
            }
        }
    });

    recalculateTotals();
}

// Toggle Auto vs Manual Calculation Mode
function toggleCalcMode() {
    const btn = document.getElementById('btnCalcMode');
    if (calcMode === 'auto') {
        calcMode = 'manual';
        btn.innerHTML = '<i class="fas fa-hand-paper me-1"></i>Manual Mode Enabled';
        btn.className = 'btn btn-warning text-dark btn-sm';
        document.getElementById('inputSubtotal').readOnly = false;
        document.getElementById('inputGstTotal').readOnly = false;
        document.getElementById('inputGrandTotal').readOnly = false;
    } else {
        calcMode = 'auto';
        btn.innerHTML = '<i class="fas fa-magic me-1"></i>Auto Calculation Mode';
        btn.className = 'btn btn-outline-success btn-sm';
        document.getElementById('inputSubtotal').readOnly = true;
        document.getElementById('inputGstTotal').readOnly = true;
        document.getElementById('inputGrandTotal').readOnly = true;
        recalculateTotals();
    }
}

// Save Editor Document Payload
async function saveDocument(e) {
    e.preventDefault();
    const form = document.getElementById('editorForm');
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());

    // Gather service rows JSON
    const items = [];
    const rows = document.querySelectorAll('#editorItemsBody tr');
    rows.forEach(tr => {
        const selectElem = tr.querySelector('select');
        items.push({
            serviceId: selectElem ? selectElem.value : '',
            description: tr.querySelector('.item-desc').value,
            quantity: parseFloat(tr.querySelector('.item-qty').value || 1),
            unit: tr.querySelector('.item-unit').value,
            rate: parseFloat(tr.querySelector('.item-rate').value || 0),
            maxRate: parseFloat(tr.querySelector('.item-maxrate').value || 0),
            priceType: tr.querySelector('.item-pricetype').value,
            discount: 0,
            gstPercent: parseFloat(tr.querySelector('.item-gst').value || 18),
            amount: parseFloat(tr.querySelector('.item-qty').value || 1) * parseFloat(tr.querySelector('.item-rate').value || 0),
            maxAmount: (tr.querySelector('.item-pricetype').value === 'range') ? parseFloat(tr.querySelector('.item-qty').value || 1) * parseFloat(tr.querySelector('.item-maxrate').value || 0) : 0
        });
    });

    body.items = JSON.stringify(items);
    body.calcMode = calcMode;

    const actionUrl = form.getAttribute('action');
    try {
        const res = await fetch(actionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const result = await res.json();
        if (result.success) {
            alert('Saved successfully!');
            window.location.href = result.redirect;
        } else {
            alert('Save failed: ' + result.message);
        }
    } catch (err) {
        alert('Network error while saving: ' + err.message);
    }
}
