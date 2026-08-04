const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/auth');
const invoiceController = require('../controllers/invoiceController');

// Active nav middleware for invoice system
router.use((req, res, next) => {
    res.locals.activeGroup = 'invoice-system';
    const path = req.path;
    if (path === '/' || path.startsWith('/dashboard')) res.locals.activeSub = 'dashboard';
    else if (path.startsWith('/estimates/create')) res.locals.activeSub = 'create-estimate';
    else if (path.startsWith('/invoices/create')) res.locals.activeSub = 'create-invoice';
    else if (path.startsWith('/estimates')) res.locals.activeSub = 'estimates';
    else if (path.startsWith('/invoices')) res.locals.activeSub = 'invoices';
    else if (path.startsWith('/drafts')) res.locals.activeSub = 'drafts';
    else if (path.startsWith('/clients')) res.locals.activeSub = 'clients';
    else if (path.startsWith('/services')) res.locals.activeSub = 'services';
    else if (path.startsWith('/templates')) res.locals.activeSub = 'templates';
    else if (path.startsWith('/settings')) res.locals.activeSub = 'settings';
    else if (path.startsWith('/reports')) res.locals.activeSub = 'reports';
    else if (path.startsWith('/logs')) res.locals.activeSub = 'logs';
    next();
});

// Guard all invoice routes with isAdmin
router.use(isAdmin);

// Dashboard
router.get('/', invoiceController.getDashboard);
router.get('/dashboard', invoiceController.getDashboard);

// Drafts
router.get('/drafts', invoiceController.getDrafts);

// Estimates
router.get('/estimates', invoiceController.getEstimates);
router.get('/estimates/create', invoiceController.createEstimateForm);
router.get('/estimates/edit/:id', invoiceController.editEstimateForm);
router.post('/estimates/save', invoiceController.saveEstimate);
router.post('/estimates/convert/:id', invoiceController.convertToInvoice);
router.post('/estimates/delete/:id', invoiceController.deleteEstimate);

// Invoices
router.get('/invoices', invoiceController.getInvoices);
router.get('/invoices/create', invoiceController.createInvoiceForm);
router.get('/invoices/edit/:id', invoiceController.editInvoiceForm);
router.post('/invoices/save', invoiceController.saveInvoice);
router.post('/invoices/delete/:id', invoiceController.deleteInvoice);
router.post('/invoices/add-payment', invoiceController.addPayment);

// Revision Restore
router.get('/restore-revision/:type/:id/:version', invoiceController.restoreRevision);

// Clients
router.get('/clients', invoiceController.getClients);
router.post('/clients/save', invoiceController.saveClient);
router.post('/clients/delete/:id', invoiceController.deleteClient);
router.get('/clients/export', invoiceController.exportClients);
router.post('/clients/import', invoiceController.importClients);

// Services
router.get('/services', invoiceController.getServices);
router.post('/services/save', invoiceController.saveService);
router.post('/services/delete/:id', invoiceController.deleteService);

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Templates
router.get('/templates', invoiceController.getTemplates);
router.post('/templates/set-default/:id', invoiceController.setDefaultTemplate);
router.post('/templates/save', invoiceController.saveTemplate);

// Settings
router.get('/settings', invoiceController.getSettings);
router.post('/settings/save', upload.single('logoFile'), invoiceController.saveSettings);

// Reports
router.get('/reports', invoiceController.getReports);

// Logs
router.get('/logs', invoiceController.getLogs);

// Print & PDF View
router.get('/print/:type/:id', invoiceController.getPrintView);

module.exports = router;
