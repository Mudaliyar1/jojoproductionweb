// Admin Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    const popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });

    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
    alerts.forEach(alert => {
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }, 5000);
    });

    // Table search functionality
    const searchInputs = document.querySelectorAll('.table-search');
    searchInputs.forEach(input => {
        input.addEventListener('input', debounce(function() {
            const searchTerm = this.value.toLowerCase();
            const tableId = this.getAttribute('data-table');
            const table = document.getElementById(tableId);
            
            if (table) {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(searchTerm) ? '' : 'none';
                });
            }
        }, 300));
    });

    // Bulk actions for tables
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.row-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateBulkActions();
        });
    }

    // Individual row selection
    const rowCheckboxes = document.querySelectorAll('.row-checkbox');
    rowCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateBulkActions);
    });

    // Image preview functionality
    const imageInputs = document.querySelectorAll('input[type="file"][accept*="image"]');
    imageInputs.forEach(input => {
        input.addEventListener('change', function() {
            const preview = document.getElementById(this.getAttribute('data-preview'));
            if (preview && this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    });

    // Drag and drop file upload
    const uploadAreas = document.querySelectorAll('.image-upload-area');
    uploadAreas.forEach(area => {
        const fileInput = document.getElementById(area.getAttribute('data-input'));
        const preview = document.getElementById(area.getAttribute('data-preview'));

        // Drag events
        area.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });

        area.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
        });

        area.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files && files[0] && fileInput) {
                fileInput.files = files;
                
                // Trigger preview
                if (preview) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                    };
                    reader.readAsDataURL(files[0]);
                }
            }
        });

        // Click to upload
        area.addEventListener('click', function() {
            if (fileInput) {
                fileInput.click();
            }
        });
    });

    // Confirm before delete
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const itemName = this.getAttribute('data-name') || 'this item';
            const deleteUrl = this.getAttribute('data-url');
            
            if (confirm(`Are you sure you want to delete ${itemName}? This action cannot be undone.`)) {
                // Create form and submit
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = deleteUrl;
                
                const methodInput = document.createElement('input');
                methodInput.type = 'hidden';
                methodInput.name = '_method';
                methodInput.value = 'DELETE';
                
                form.appendChild(methodInput);
                document.body.appendChild(form);
                form.submit();
            }
        });
    });

    // Status update buttons
    const statusButtons = document.querySelectorAll('.status-btn');
    statusButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const url = this.getAttribute('data-url');
            const status = this.getAttribute('data-status');
            
            fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken()
                },
                body: JSON.stringify({ status })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Status updated successfully', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showToast('Error updating status', 'error');
                }
            })
            .catch(error => {
                showToast('Error updating status', 'error');
            });
        });
    });

    // Chart initialization (if Chart.js is available)
    if (typeof Chart !== 'undefined') {
        initializeCharts();
    }

    // Real-time notifications (if WebSocket is available)
    if (typeof WebSocket !== 'undefined') {
        initializeWebSocket();
    }

    console.log('Admin dashboard loaded successfully!');
});

// Utility functions
function updateBulkActions() {
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
    const bulkActions = document.querySelector('.bulk-actions');
    
    if (bulkActions) {
        if (checkedBoxes.length > 0) {
            bulkActions.style.display = 'block';
            document.getElementById('selectedCount').textContent = checkedBoxes.length;
        } else {
            bulkActions.style.display = 'none';
        }
    }
}

function getCsrfToken() {
    const token = document.querySelector('meta[name="csrf-token"]');
    return token ? token.getAttribute('content') : '';
}

function showToast(message, type = 'info') {
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';
    
    const bgClass = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-danger' : 'bg-info';
    const iconClass = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    
    toastContainer.innerHTML = `
        <div class="toast align-items-center text-white ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas ${iconClass} me-2"></i>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    document.body.appendChild(toastContainer);
    const toast = new bootstrap.Toast(toastContainer.querySelector('.toast'));
    toast.show();
    
    // Remove container after toast is hidden
    toastContainer.querySelector('.toast').addEventListener('hidden.bs.toast', () => {
        toastContainer.remove();
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function initializeCharts() {
    // Dashboard statistics chart
    const statsChart = document.getElementById('statsChart');
    if (statsChart) {
        new Chart(statsChart, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Inquiries',
                    data: [12, 19, 3, 5, 2, 3],
                    borderColor: '#d4af37',
                    backgroundColor: 'rgba(212, 175, 55, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function initializeWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        console.log('WebSocket connection established');
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        // Handle incoming messages, e.g., display notifications
        if (data.type === 'notification') {
            showNotification(data.message);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Attempt to reconnect after a delay
        setTimeout(initializeWebSocket, 3000);
    };

    ws.onerror = error => {
        console.error('WebSocket error occurred:', error);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'new_inquiry':
            showToast('New inquiry received!', 'success');
            // Update inquiry count if on dashboard
            const inquiryCount = document.querySelector('.inquiry-count');
            if (inquiryCount) {
                inquiryCount.textContent = parseInt(inquiryCount.textContent) + 1;
            }
            break;
        case 'user_registered':
            showToast('New user registered', 'info');
            break;
        case 'service_updated':
            showToast('Service updated', 'info');
            break;
    }
}

// Bulk operations
function performBulkAction(action) {
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
    const ids = Array.from(checkedBoxes).map(cb => cb.value);
    
    if (ids.length === 0) {
        showToast('Please select items first', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to ${action} ${ids.length} items?`)) {
        return;
    }
    
    fetch(`/admin/bulk/${action}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({ ids })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`${ids.length} items ${action}d successfully`, 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            showToast('Error performing bulk action', 'error');
        }
    })
    .catch(error => {
        showToast('Error performing bulk action', 'error');
    });
}

// Initialize tooltips
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
  return new bootstrap.Tooltip(tooltipTriggerEl)
})

// Initialize popovers
var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'))
var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
  return new bootstrap.Popover(popoverTriggerEl)
})

// Auto-hide alerts after 5 seconds
document.addEventListener('DOMContentLoaded', function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            const bootstrapAlert = bootstrap.Alert.getInstance(alert);
            if (bootstrapAlert) {
                bootstrapAlert.close();
            } else {
                alert.remove();
            }
        }, 5000);
    });
});

// Table search functionality
const searchInput = document.getElementById('tableSearch');
if (searchInput) {
    searchInput.addEventListener('keyup', function() {
        const value = this.value.toLowerCase();
        const rows = document.querySelectorAll('#dataTable tbody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(value) ? '' : 'none';
        });
    });
}

// Bulk actions for tables
const bulkActionCheckbox = document.getElementById('bulkActionCheckbox');
if (bulkActionCheckbox) {
    bulkActionCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('#dataTable tbody input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        updateBulkActions();
    });
}

document.querySelectorAll('#dataTable tbody input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', updateBulkActions);
});

function updateBulkActions() {
    const checkedCheckboxes = document.querySelectorAll('#dataTable tbody input[type="checkbox"]:checked');
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');
    if (bulkActionsContainer) {
        if (checkedCheckboxes.length > 0) {
            bulkActionsContainer.style.display = 'block';
        } else {
            bulkActionsContainer.style.display = 'none';
        }
    }
}

// Image preview and drag-and-drop file upload
const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');

if (imageUpload && imagePreview) {
    imageUpload.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // Drag and drop functionality
    imagePreview.addEventListener('dragover', (e) => {
        e.preventDefault();
        imagePreview.classList.add('drag-over');
    });

    imagePreview.addEventListener('dragleave', () => {
        imagePreview.classList.remove('drag-over');
    });

    imagePreview.addEventListener('drop', (e) => {
        e.preventDefault();
        imagePreview.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
            // Set the file to the input element
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            imageUpload.files = dataTransfer.files;
        }
    });
}

// Confirm before delete functionality
document.querySelectorAll('.confirm-delete').forEach(button => {
    button.addEventListener('click', function(e) {
        e.preventDefault();
        const form = this.closest('form');
        Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                form.submit();
            }
        });
    });
});

// Status update buttons
document.querySelectorAll('.status-update-btn').forEach(button => {
    button.addEventListener('click', function(e) {
        e.preventDefault();
        const form = this.closest('form');
        const currentStatus = this.dataset.currentStatus;
        const newStatus = this.dataset.newStatus;

        Swal.fire({
            title: 'Confirm Status Change',
            text: `Change status from ${currentStatus} to ${newStatus}?`,
            icon: 'info',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, change it!'
        }).then((result) => {
            if (result.isConfirmed) {
                form.submit();
            }
        });
    });
});

// Chart.js initialization (example, adjust as needed)
var ctx = document.getElementById('myChart');
if (ctx) {
    var myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
            datasets: [{
                label: '# of Votes',
                data: [12, 19, 3, 5, 2, 3],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.2)',
                    'rgba(54, 162, 235, 0.2)',
                    'rgba(255, 206, 86, 0.2)',
                    'rgba(75, 192, 192, 0.2)',
                    'rgba(153, 102, 255, 0.2)',
                    'rgba(255, 159, 64, 0.2)'
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(153, 102, 255, 1)',
                    'rgba(255, 159, 64, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// WebSocket initialization (example, adjust as needed)
const socket = new WebSocket('ws://localhost:3000');

socket.onopen = function(event) {
    console.log('WebSocket is open now.');
};

socket.onmessage = function(event) {
    console.log('WebSocket message received:', event.data);
    // Handle incoming message
};

socket.onclose = function(event) {
    console.log('WebSocket is closed now.');
};

socket.onerror = function(error) {
    console.error('WebSocket error:', error);
};

// Utility function to get CSRF token
function getCsrfToken() {
    return document.querySelector('meta[name="_csrf"]').getAttribute('content');
}

// Utility function to show toast messages
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        console.warn('Toast container not found.');
        return;
    }

    const toast = document.createElement('div');
    toast.classList.add('toast', `bg-${type}`, 'text-white', 'border-0');
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    toastContainer.appendChild(toast);
    const bootstrapToast = new bootstrap.Toast(toast);
    bootstrapToast.show();
}

// Debounce function for performance
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Example of using debounce with search input
// searchInput.addEventListener('keyup', debounce(function() {
//     // Your search logic here
//     console.log('Searching for:', this.value);
// }, 300));

// Function to perform bulk action (example)
function performBulkAction(actionUrl, method = 'POST') {
    const checkedCheckboxes = document.querySelectorAll('#dataTable tbody input[type="checkbox"]:checked');
    const ids = Array.from(checkedCheckboxes).map(cb => cb.value);

    if (ids.length === 0) {
        showToast('No items selected for bulk action.', 'warning');
        return;
    }

    Swal.fire({
        title: 'Confirm Bulk Action',
        text: `Are you sure you want to perform this action on ${ids.length} selected items?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, proceed!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const csrfToken = getCsrfToken();
                const response = await fetch(actionUrl, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ ids: ids })
                });

                const data = await response.json();

                if (response.ok) {
                    showToast(data.message || 'Bulk action performed successfully!');
                    // Optionally reload page or update UI
                    location.reload();
                } else {
                    showToast(data.message || 'Failed to perform bulk action.', 'danger');
                }
            } catch (error) {
                console.error('Error during bulk action:', error);
                showToast('An error occurred during bulk action.', 'danger');
            }
        }
    });
}

// Sidebar toggling logic
// const sidebarToggle = document.querySelector('.navbar-toggler');
// const sidebarCloseButton = document.querySelector('.sidebar-header .btn-close');
// const sidebar = document.getElementById('adminSidebar');
// const mainContent = document.querySelector('.main-content');

// if (sidebarToggle && sidebar && mainContent) {
//     sidebarToggle.addEventListener('click', function() {
//         sidebar.classList.toggle('show');
//         mainContent.classList.toggle('sidebar-expanded');
//     });
// }

// if (sidebarCloseButton && sidebar && mainContent) {
//     sidebarCloseButton.addEventListener('click', function() {
//         sidebar.classList.remove('show');
//         mainContent.classList.remove('sidebar-expanded');
//     });
// }
