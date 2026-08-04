const Estimate = require('../models/Estimate');
const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const InvoiceService = require('../models/InvoiceService');
const Payment = require('../models/Payment');
const InvoiceTemplate = require('../models/InvoiceTemplate');
const InvoiceSettings = require('../models/InvoiceSettings');
const InvoiceActivityLog = require('../models/InvoiceActivityLog');
const { logActivity } = require('../helpers/logHelper');
const { generateUpiQrUrl } = require('../helpers/qrHelper');

// Helper to ensure settings exist
const getOrCreateSettings = async () => {
    let settings = await InvoiceSettings.findOne();
    if (!settings) {
        settings = await InvoiceSettings.create({});
    }
    return settings;
};

// Seed default templates if empty
const seedDefaultTemplates = async () => {
    const count = await InvoiceTemplate.countDocuments();
    if (count === 0) {
        const templates = [
            { name: 'Classic', slug: 'classic', isDefault: true, primaryColor: '#1a252f', secondaryColor: '#3498db', fontFamily: 'Poppins' },
            { name: 'Modern', slug: 'modern', primaryColor: '#2c3e50', secondaryColor: '#e74c3c', fontFamily: 'Inter' },
            { name: 'Minimal', slug: 'minimal', primaryColor: '#333333', secondaryColor: '#7f8c8d', fontFamily: 'Roboto' },
            { name: 'Corporate', slug: 'corporate', primaryColor: '#0b3c5d', secondaryColor: '#328cc1', fontFamily: 'Poppins' },
            { name: 'Luxury', slug: 'luxury', primaryColor: '#1d1e22', secondaryColor: '#d4af37', fontFamily: 'Playfair Display' },
            { name: 'Wedding', slug: 'wedding', primaryColor: '#4a2e35', secondaryColor: '#c5a059', fontFamily: 'Playfair Display' },
            { name: 'Event', slug: 'event', primaryColor: '#6c5ce7', secondaryColor: '#a29bfe', fontFamily: 'Poppins' },
            { name: 'Photography', slug: 'photography', primaryColor: '#111111', secondaryColor: '#00cec9', fontFamily: 'Inter' },
            { name: 'Entertainment', slug: 'entertainment', primaryColor: '#d63031', secondaryColor: '#fdcb6e', fontFamily: 'Poppins' }
        ];
        await InvoiceTemplate.insertMany(templates);
    }
};

// ====================================================
// DASHBOARD
// ====================================================
exports.getDashboard = async (req, res) => {
    try {
        await seedDefaultTemplates();
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const totalEstimates = await Estimate.countDocuments();
        const draftEstimates = await Estimate.countDocuments({ status: 'Draft' });
        const pendingEstimates = await Estimate.countDocuments({ status: 'Sent' });
        const approvedEstimates = await Estimate.countDocuments({ status: 'Approved' });
        const convertedInvoices = await Estimate.countDocuments({ status: 'Converted' });
        const paidInvoices = await Invoice.countDocuments({ status: 'Paid' });

        // Financial aggregates
        const pendingInvoices = await Invoice.find({ status: { $ne: 'Paid' } });
        const pendingPayments = pendingInvoices.reduce((acc, inv) => acc + (inv.balanceDue || 0), 0);

        const monthlyPayments = await Payment.find({ paymentDate: { $gte: startOfMonth } });
        const monthlyRevenue = monthlyPayments.reduce((acc, p) => acc + p.amount, 0);

        const todayPayments = await Payment.find({ paymentDate: { $gte: startOfToday } });
        const todayRevenue = todayPayments.reduce((acc, p) => acc + p.amount, 0);

        const totalClients = await Client.countDocuments();
        const upcomingEvents = await Client.find({ eventDate: { $gte: startOfToday } }).sort({ eventDate: 1 }).limit(5);

        // Recent streams
        const recentEstimates = await Estimate.find().sort({ createdAt: -1 }).limit(5);
        const recentInvoices = await Invoice.find().sort({ createdAt: -1 }).limit(5);
        const recentPayments = await Payment.find().sort({ createdAt: -1 }).limit(5);

        res.render('admin/invoice-system/dashboard', {
            title: 'Invoice System Dashboard',
            stats: {
                totalEstimates,
                draftEstimates,
                pendingEstimates,
                approvedEstimates,
                convertedInvoices,
                paidInvoices,
                pendingPayments,
                monthlyRevenue,
                todayRevenue,
                totalClients,
                upcomingEventsCount: upcomingEvents.length
            },
            recentEstimates,
            recentInvoices,
            recentPayments,
            upcomingEvents
        });
    } catch (error) {
        console.error('Error in getDashboard:', error);
        req.flash('error_msg', 'Failed to load dashboard data');
        res.redirect('/admin');
    }
};

// ====================================================
// ESTIMATES MANAGEMENT
// ====================================================
exports.getEstimates = async (req, res) => {
    try {
        const { search, status, month } = req.query;
        let query = {};
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { estimateNumber: new RegExp(search, 'i') },
                { 'client.name': new RegExp(search, 'i') },
                { 'client.mobile': new RegExp(search, 'i') },
                { 'client.eventName': new RegExp(search, 'i') }
            ];
        }
        const estimates = await Estimate.find(query).sort({ createdAt: -1 });
        res.render('admin/invoice-system/estimates-list', {
            title: 'All Estimates',
            estimates,
            search: search || '',
            statusFilter: status || ''
        });
    } catch (error) {
        console.error('Error in getEstimates:', error);
        req.flash('error_msg', 'Error loading estimates');
        res.redirect('/admin/invoice-system');
    }
};

exports.getDrafts = async (req, res) => {
    try {
        const draftEstimates = await Estimate.find({ status: 'Draft' }).sort({ createdAt: -1 });
        const draftInvoices = await Invoice.find({ status: 'Draft' }).sort({ createdAt: -1 });
        res.render('admin/invoice-system/drafts-list', {
            title: 'Draft Documents',
            draftEstimates,
            draftInvoices
        });
    } catch (error) {
        console.error('Error in getDrafts:', error);
        req.flash('error_msg', 'Error loading drafts');
        res.redirect('/admin/invoice-system');
    }
};

exports.createEstimateForm = async (req, res) => {
    try {
        const settings = await getOrCreateSettings();
        const clients = await Client.find().sort({ name: 1 });
        const services = await InvoiceService.find({ status: 'active' }).sort({ name: 1 });
        const templates = await InvoiceTemplate.find();
        
        // Format next estimate number: EST000001
        const numStr = String(settings.nextEstimateNum).padStart(6, '0');
        const autoDocNum = `${settings.estimatePrefix}${numStr}`;

        res.render('admin/invoice-system/editor', {
            title: 'Create Estimate',
            docType: 'estimate',
            doc: null,
            autoDocNum,
            settings,
            clients,
            services,
            templates
        });
    } catch (error) {
        console.error('Error in createEstimateForm:', error);
        req.flash('error_msg', 'Error opening estimate creator');
        res.redirect('/admin/invoice-system/estimates');
    }
};

exports.editEstimateForm = async (req, res) => {
    try {
        const estimate = await Estimate.findById(req.params.id);
        if (!estimate) {
            req.flash('error_msg', 'Estimate not found');
            return res.redirect('/admin/invoice-system/estimates');
        }
        const settings = await getOrCreateSettings();
        const clients = await Client.find().sort({ name: 1 });
        const services = await InvoiceService.find({ status: 'active' }).sort({ name: 1 });
        const templates = await InvoiceTemplate.find();

        res.render('admin/invoice-system/editor', {
            title: `Edit Estimate - ${estimate.estimateNumber}`,
            docType: 'estimate',
            doc: estimate,
            autoDocNum: estimate.estimateNumber,
            settings,
            clients,
            services,
            templates
        });
    } catch (error) {
        console.error('Error in editEstimateForm:', error);
        req.flash('error_msg', 'Error opening estimate editor');
        res.redirect('/admin/invoice-system/estimates');
    }
};

exports.saveEstimate = async (req, res) => {
    try {
        const payload = req.body;
        const settings = await getOrCreateSettings();
        let estimate;

        // Extract and format items
        let items = [];
        if (payload.items) {
            items = typeof payload.items === 'string' ? JSON.parse(payload.items) : payload.items;
        }

        const docData = {
            estimateNumber: payload.estimateNumber || `EST${Date.now()}`,
            client: {
                id: payload.clientId || null,
                name: payload.clientName || '',
                mobile: payload.clientMobile || '',
                email: payload.clientEmail || '',
                address: payload.clientAddress || '',
                eventName: payload.eventName || '',
                eventDate: payload.eventDate ? new Date(payload.eventDate) : null,
                venue: payload.venue || ''
            },
            companyDetails: {
                companyName: payload.companyName || settings.companyName,
                tagline: payload.companyTagline || settings.tagline,
                logoUrl: (payload.companyLogoUrl && payload.companyLogoUrl.startsWith('http')) ? payload.companyLogoUrl : settings.logoUrl,
                address: payload.companyAddress || settings.address,
                phone: payload.companyPhone || settings.phone,
                email: payload.companyEmail || settings.email,
                website: payload.companyWebsite || settings.website,
                instagram: payload.companyInstagram || settings.instagram,
                gstNumber: payload.companyGst || settings.gstNumber,
                panNumber: payload.companyPan || settings.panNumber,
                bankName: payload.bankName || settings.bankName,
                accountNumber: payload.accountNumber || settings.accountNumber,
                ifscCode: payload.ifscCode || settings.ifscCode,
                branchName: payload.branchName || settings.branchName,
                upiId: payload.upiId || settings.upiId,
                signatureUrl: payload.signatureUrl || settings.signatureUrl
            },
            estimateDate: payload.estimateDate ? new Date(payload.estimateDate) : new Date(),
            expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : null,
            salesPerson: payload.salesPerson || '',
            status: payload.status || 'Draft',
            items: items,
            calcMode: payload.calcMode || 'auto',
            subtotal: parseFloat(payload.subtotal || 0),
            minTotal: parseFloat(payload.minTotal || 0),
            maxTotal: parseFloat(payload.maxTotal || 0),
            discountTotal: parseFloat(payload.discountTotal || 0),
            gstTotal: parseFloat(payload.gstTotal || 0),
            cgst: parseFloat(payload.cgst || 0),
            sgst: parseFloat(payload.sgst || 0),
            igst: parseFloat(payload.igst || 0),
            transportCharges: parseFloat(payload.transportCharges || 0),
            otherCharges: parseFloat(payload.otherCharges || 0),
            grandTotal: parseFloat(payload.grandTotal || 0),
            advancePaid: parseFloat(payload.advancePaid || 0),
            balanceDue: parseFloat(payload.balanceDue || 0),
            notes: payload.notes || settings.defaultNotes,
            terms: payload.terms || settings.defaultTerms,
            watermark: payload.watermark || 'Estimate',
            templateId: payload.templateId || 'classic',
            customStyles: payload.customStyles ? (typeof payload.customStyles === 'string' ? JSON.parse(payload.customStyles) : payload.customStyles) : {}
        };

        if (payload.id) {
            estimate = await Estimate.findById(payload.id);
            if (estimate) {
                // Record revision snapshot before updating
                const currentSnapshot = estimate.toObject();
                estimate.revisionHistory.push({
                    version: estimate.version,
                    updatedAt: new Date(),
                    updatedBy: req.session.user ? req.session.user.name : 'Admin',
                    snapshot: currentSnapshot
                });
                estimate.version += 1;
                Object.assign(estimate, docData);
                await estimate.save();
                await logActivity(req, 'UPDATE', 'Estimate', `Updated Estimate ${estimate.estimateNumber}`, estimate._id, estimate.estimateNumber);
            }
        } else {
            estimate = await Estimate.create(docData);
            // Increment next estimate number
            settings.nextEstimateNum += 1;
            await settings.save();
            await logActivity(req, 'CREATE', 'Estimate', `Created Estimate ${estimate.estimateNumber}`, estimate._id, estimate.estimateNumber);
        }

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({ success: true, redirect: '/admin/invoice-system/estimates', id: estimate._id });
        }
        req.flash('success_msg', `Estimate ${estimate.estimateNumber} saved successfully!`);
        res.redirect('/admin/invoice-system/estimates');
    } catch (error) {
        console.error('Error in saveEstimate:', error);
        if (req.xhr) return res.status(500).json({ success: false, message: error.message });
        req.flash('error_msg', 'Failed to save estimate: ' + error.message);
        res.redirect('/admin/invoice-system/estimates');
    }
};

exports.convertToInvoice = async (req, res) => {
    try {
        const estimate = await Estimate.findById(req.params.id);
        if (!estimate) {
            req.flash('error_msg', 'Estimate not found');
            return res.redirect('/admin/invoice-system/estimates');
        }
        const settings = await getOrCreateSettings();
        const numStr = String(settings.nextInvoiceNum).padStart(6, '0');
        const invoiceNumber = `${settings.invoicePrefix}${numStr}`;

        const invoiceData = {
            invoiceNumber,
            estimateId: estimate._id,
            estimateNumber: estimate.estimateNumber,
            client: estimate.client,
            companyDetails: estimate.companyDetails,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
            salesPerson: estimate.salesPerson,
            status: 'Unpaid',
            items: estimate.items,
            calcMode: estimate.calcMode,
            subtotal: estimate.subtotal,
            minTotal: estimate.minTotal,
            maxTotal: estimate.maxTotal,
            discountTotal: estimate.discountTotal,
            gstTotal: estimate.gstTotal,
            cgst: estimate.cgst,
            sgst: estimate.sgst,
            igst: estimate.igst,
            transportCharges: estimate.transportCharges,
            otherCharges: estimate.otherCharges,
            grandTotal: estimate.grandTotal,
            advancePaid: estimate.advancePaid,
            balanceDue: estimate.grandTotal - estimate.advancePaid,
            notes: estimate.notes,
            terms: estimate.terms,
            watermark: 'Draft',
            templateId: estimate.templateId,
            customStyles: estimate.customStyles,
            createdBy: req.session.user ? req.session.user.name : 'Admin'
        };

        const invoice = await Invoice.create(invoiceData);
        settings.nextInvoiceNum += 1;
        await settings.save();

        estimate.status = 'Converted';
        await estimate.save();

        await logActivity(req, 'CONVERT', 'Estimate', `Converted Estimate ${estimate.estimateNumber} to Invoice ${invoice.invoiceNumber}`, invoice._id, invoice.invoiceNumber);

        req.flash('success_msg', `Converted Estimate ${estimate.estimateNumber} to Invoice ${invoice.invoiceNumber}`);
        res.redirect(`/admin/invoice-system/invoices/edit/${invoice._id}`);
    } catch (error) {
        console.error('Error in convertToInvoice:', error);
        req.flash('error_msg', 'Failed to convert estimate to invoice');
        res.redirect('/admin/invoice-system/estimates');
    }
};

exports.deleteEstimate = async (req, res) => {
    try {
        const estimate = await Estimate.findByIdAndDelete(req.params.id);
        if (estimate) {
            await logActivity(req, 'DELETE', 'Estimate', `Deleted Estimate ${estimate.estimateNumber}`, estimate._id, estimate.estimateNumber);
        }
        req.flash('success_msg', 'Estimate deleted successfully');
        res.redirect('/admin/invoice-system/estimates');
    } catch (error) {
        console.error('Error in deleteEstimate:', error);
        req.flash('error_msg', 'Error deleting estimate');
        res.redirect('/admin/invoice-system/estimates');
    }
};

// ====================================================
// INVOICES MANAGEMENT
// ====================================================
exports.getInvoices = async (req, res) => {
    try {
        const { search, status } = req.query;
        let query = {};
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { invoiceNumber: new RegExp(search, 'i') },
                { 'client.name': new RegExp(search, 'i') },
                { 'client.mobile': new RegExp(search, 'i') },
                { 'client.eventName': new RegExp(search, 'i') }
            ];
        }
        const invoices = await Invoice.find(query).sort({ createdAt: -1 });
        res.render('admin/invoice-system/invoices-list', {
            title: 'All Invoices',
            invoices,
            search: search || '',
            statusFilter: status || ''
        });
    } catch (error) {
        console.error('Error in getInvoices:', error);
        req.flash('error_msg', 'Error loading invoices');
        res.redirect('/admin/invoice-system');
    }
};

exports.createInvoiceForm = async (req, res) => {
    try {
        const settings = await getOrCreateSettings();
        const clients = await Client.find().sort({ name: 1 });
        const services = await InvoiceService.find({ status: 'active' }).sort({ name: 1 });
        const templates = await InvoiceTemplate.find();
        
        const numStr = String(settings.nextInvoiceNum).padStart(6, '0');
        const autoDocNum = `${settings.invoicePrefix}${numStr}`;

        res.render('admin/invoice-system/editor', {
            title: 'Create Invoice',
            docType: 'invoice',
            doc: null,
            autoDocNum,
            settings,
            clients,
            services,
            templates
        });
    } catch (error) {
        console.error('Error in createInvoiceForm:', error);
        req.flash('error_msg', 'Error opening invoice creator');
        res.redirect('/admin/invoice-system/invoices');
    }
};

exports.editInvoiceForm = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) {
            req.flash('error_msg', 'Invoice not found');
            return res.redirect('/admin/invoice-system/invoices');
        }
        const settings = await getOrCreateSettings();
        const clients = await Client.find().sort({ name: 1 });
        const services = await InvoiceService.find({ status: 'active' }).sort({ name: 1 });
        const templates = await InvoiceTemplate.find();
        const payments = await Payment.find({ invoiceId: invoice._id }).sort({ createdAt: -1 });

        res.render('admin/invoice-system/editor', {
            title: `Edit Invoice - ${invoice.invoiceNumber}`,
            docType: 'invoice',
            doc: invoice,
            autoDocNum: invoice.invoiceNumber,
            settings,
            clients,
            services,
            templates,
            payments
        });
    } catch (error) {
        console.error('Error in editInvoiceForm:', error);
        req.flash('error_msg', 'Error opening invoice editor');
        res.redirect('/admin/invoice-system/invoices');
    }
};

exports.saveInvoice = async (req, res) => {
    try {
        const payload = req.body;
        const settings = await getOrCreateSettings();
        let invoice;

        let items = [];
        if (payload.items) {
            items = typeof payload.items === 'string' ? JSON.parse(payload.items) : payload.items;
        }

        const docData = {
            invoiceNumber: payload.invoiceNumber || `INV${Date.now()}`,
            client: {
                id: payload.clientId || null,
                name: payload.clientName || '',
                mobile: payload.clientMobile || '',
                email: payload.clientEmail || '',
                address: payload.clientAddress || '',
                eventName: payload.eventName || '',
                eventDate: payload.eventDate ? new Date(payload.eventDate) : null,
                venue: payload.venue || ''
            },
            companyDetails: {
                companyName: payload.companyName || settings.companyName,
                tagline: payload.companyTagline || settings.tagline,
                logoUrl: (payload.companyLogoUrl && payload.companyLogoUrl.startsWith('http')) ? payload.companyLogoUrl : settings.logoUrl,
                address: payload.companyAddress || settings.address,
                phone: payload.companyPhone || settings.phone,
                email: payload.companyEmail || settings.email,
                website: payload.companyWebsite || settings.website,
                instagram: payload.companyInstagram || settings.instagram,
                gstNumber: payload.companyGst || settings.gstNumber,
                panNumber: payload.companyPan || settings.panNumber,
                bankName: payload.bankName || settings.bankName,
                accountNumber: payload.accountNumber || settings.accountNumber,
                ifscCode: payload.ifscCode || settings.ifscCode,
                branchName: payload.branchName || settings.branchName,
                upiId: payload.upiId || settings.upiId,
                signatureUrl: payload.signatureUrl || settings.signatureUrl
            },
            invoiceDate: payload.invoiceDate ? new Date(payload.invoiceDate) : new Date(),
            dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
            salesPerson: payload.salesPerson || '',
            status: payload.status || 'Draft',
            items: items,
            calcMode: payload.calcMode || 'auto',
            subtotal: parseFloat(payload.subtotal || 0),
            minTotal: parseFloat(payload.minTotal || 0),
            maxTotal: parseFloat(payload.maxTotal || 0),
            discountTotal: parseFloat(payload.discountTotal || 0),
            gstTotal: parseFloat(payload.gstTotal || 0),
            cgst: parseFloat(payload.cgst || 0),
            sgst: parseFloat(payload.sgst || 0),
            igst: parseFloat(payload.igst || 0),
            transportCharges: parseFloat(payload.transportCharges || 0),
            otherCharges: parseFloat(payload.otherCharges || 0),
            grandTotal: parseFloat(payload.grandTotal || 0),
            advancePaid: parseFloat(payload.advancePaid || 0),
            balanceDue: parseFloat(payload.balanceDue || 0),
            notes: payload.notes || settings.defaultNotes,
            terms: payload.terms || settings.defaultTerms,
            watermark: payload.watermark || 'Draft',
            templateId: payload.templateId || 'classic',
            customStyles: payload.customStyles ? (typeof payload.customStyles === 'string' ? JSON.parse(payload.customStyles) : payload.customStyles) : {}
        };

        if (payload.id) {
            invoice = await Invoice.findById(payload.id);
            if (invoice) {
                const currentSnapshot = invoice.toObject();
                invoice.revisionHistory.push({
                    version: invoice.version,
                    updatedAt: new Date(),
                    updatedBy: req.session.user ? req.session.user.name : 'Admin',
                    snapshot: currentSnapshot
                });
                invoice.version += 1;
                Object.assign(invoice, docData);
                await invoice.save();
                await logActivity(req, 'UPDATE', 'Invoice', `Updated Invoice ${invoice.invoiceNumber}`, invoice._id, invoice.invoiceNumber);
            }
        } else {
            invoice = await Invoice.create(docData);
            settings.nextInvoiceNum += 1;
            await settings.save();
            await logActivity(req, 'CREATE', 'Invoice', `Created Invoice ${invoice.invoiceNumber}`, invoice._id, invoice.invoiceNumber);
        }

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({ success: true, redirect: '/admin/invoice-system/invoices', id: invoice._id });
        }
        req.flash('success_msg', `Invoice ${invoice.invoiceNumber} saved successfully!`);
        res.redirect('/admin/invoice-system/invoices');
    } catch (error) {
        console.error('Error in saveInvoice:', error);
        if (req.xhr) return res.status(500).json({ success: false, message: error.message });
        req.flash('error_msg', 'Failed to save invoice: ' + error.message);
        res.redirect('/admin/invoice-system/invoices');
    }
};

exports.deleteInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findByIdAndDelete(req.params.id);
        if (invoice) {
            await logActivity(req, 'DELETE', 'Invoice', `Deleted Invoice ${invoice.invoiceNumber}`, invoice._id, invoice.invoiceNumber);
        }
        req.flash('success_msg', 'Invoice deleted successfully');
        res.redirect('/admin/invoice-system/invoices');
    } catch (error) {
        console.error('Error in deleteInvoice:', error);
        req.flash('error_msg', 'Error deleting invoice');
        res.redirect('/admin/invoice-system/invoices');
    }
};

exports.addPayment = async (req, res) => {
    try {
        const { invoiceId, amount, paymentMethod, paymentDate, transactionRef, notes } = req.body;
        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        const receiptNumber = `REC${Date.now()}`;
        const payment = await Payment.create({
            receiptNumber,
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            clientId: invoice.client ? invoice.client.id : null,
            clientName: invoice.client ? invoice.client.name : '',
            amount: parseFloat(amount),
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            paymentMethod,
            transactionRef: transactionRef || '',
            notes: notes || '',
            createdBy: req.session.user ? req.session.user.name : 'Admin'
        });

        // Update invoice balance and status
        invoice.advancePaid += parseFloat(amount);
        invoice.balanceDue = Math.max(0, invoice.grandTotal - invoice.advancePaid);
        if (invoice.balanceDue === 0) {
            invoice.status = 'Paid';
            invoice.watermark = 'Paid';
        } else if (invoice.advancePaid > 0) {
            invoice.status = 'Partially Paid';
        }
        await invoice.save();

        await logActivity(req, 'PAYMENT', 'Payment', `Recorded payment of ₹${amount} for Invoice ${invoice.invoiceNumber} via ${paymentMethod}`, payment._id, receiptNumber);

        res.json({ success: true, message: 'Payment recorded successfully', receiptNumber });
    } catch (error) {
        console.error('Error in addPayment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Restore Revision Snapshot
exports.restoreRevision = async (req, res) => {
    try {
        const { type, id, version } = req.params;
        let doc, Model;
        if (type === 'estimate') Model = Estimate;
        else Model = Invoice;

        doc = await Model.findById(id);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

        const rev = doc.revisionHistory.find(r => r.version === parseInt(version));
        if (!rev || !rev.snapshot) {
            req.flash('error_msg', 'Revision version not found');
            return res.redirect(`/admin/invoice-system/${type}s/edit/${id}`);
        }

        // Apply snapshot data while maintaining current revision history
        const history = doc.revisionHistory;
        const nextVer = (doc.version || 1) + 1;

        const snapshotData = { ...rev.snapshot };
        delete snapshotData._id;
        delete snapshotData.__v;
        delete snapshotData.createdAt;
        delete snapshotData.updatedAt;

        snapshotData.revisionHistory = history;
        snapshotData.version = nextVer;

        doc = await Model.findByIdAndUpdate(id, { $set: snapshotData }, { new: true });

        await logActivity(req, 'RESTORE', type === 'estimate' ? 'Estimate' : 'Invoice', `Restored revision v${version} for ${doc.estimateNumber || doc.invoiceNumber}`, doc._id);

        req.flash('success_msg', `Restored revision version ${version}`);
        res.redirect(`/admin/invoice-system/${type}s/edit/${doc._id}`);
    } catch (error) {
        console.error('Error in restoreRevision:', error);
        req.flash('error_msg', 'Failed to restore revision: ' + error.message);
        res.redirect('/admin/invoice-system');
    }
};

// ====================================================
// CLIENT MANAGEMENT
// ====================================================
exports.getClients = async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = {};
        if (search) {
            query.$or = [
                { name: new RegExp(search, 'i') },
                { companyName: new RegExp(search, 'i') },
                { mobile: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { city: new RegExp(search, 'i') }
            ];
        }
        const clients = await Client.find(query).sort({ createdAt: -1 });
        res.render('admin/invoice-system/clients', {
            title: 'Client Directory',
            clients,
            search
        });
    } catch (error) {
        console.error('Error in getClients:', error);
        req.flash('error_msg', 'Error loading clients');
        res.redirect('/admin/invoice-system');
    }
};

exports.saveClient = async (req, res) => {
    try {
        const data = { ...req.body };
        if (!data.id) delete data.id;

        let client;
        if (data.id) {
            client = await Client.findByIdAndUpdate(data.id, data, { new: true });
            await logActivity(req, 'UPDATE', 'Client', `Updated client ${client.name}`, client._id);
        } else {
            client = await Client.create(data);
            await logActivity(req, 'CREATE', 'Client', `Created client ${client.name}`, client._id);
        }
        if (req.xhr) return res.json({ success: true, client });
        req.flash('success_msg', `Client ${client.name} saved successfully`);
        res.redirect('/admin/invoice-system/clients');
    } catch (error) {
        console.error('Error in saveClient:', error);
        if (req.xhr) return res.status(500).json({ success: false, message: error.message });
        req.flash('error_msg', 'Failed to save client: ' + error.message);
        res.redirect('/admin/invoice-system/clients');
    }
};

exports.deleteClient = async (req, res) => {
    try {
        const client = await Client.findByIdAndDelete(req.params.id);
        if (client) {
            await logActivity(req, 'DELETE', 'Client', `Deleted client ${client.name}`, client._id);
        }
        req.flash('success_msg', 'Client deleted successfully');
        res.redirect('/admin/invoice-system/clients');
    } catch (error) {
        console.error('Error in deleteClient:', error);
        req.flash('error_msg', 'Error deleting client');
        res.redirect('/admin/invoice-system/clients');
    }
};

exports.exportClients = async (req, res) => {
    try {
        const clients = await Client.find().lean();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=clients_export.json');
        res.send(JSON.stringify(clients, null, 2));
    } catch (error) {
        res.status(500).send('Error exporting clients');
    }
};

exports.importClients = async (req, res) => {
    try {
        const { clientData } = req.body;
        const parsed = JSON.parse(clientData);
        if (Array.isArray(parsed)) {
            await Client.insertMany(parsed);
            await logActivity(req, 'IMPORT', 'Client', `Imported ${parsed.length} clients`);
            req.flash('success_msg', `Successfully imported ${parsed.length} clients`);
        } else {
            req.flash('error_msg', 'Invalid JSON array provided');
        }
        res.redirect('/admin/invoice-system/clients');
    } catch (error) {
        req.flash('error_msg', 'Failed to import clients: ' + error.message);
        res.redirect('/admin/invoice-system/clients');
    }
};

// ====================================================
// SERVICES CATALOG
// ====================================================
exports.getServices = async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = {};
        if (search) {
            query.$or = [
                { name: new RegExp(search, 'i') },
                { category: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') }
            ];
        }
        const services = await InvoiceService.find(query).sort({ category: 1, name: 1 });
        res.render('admin/invoice-system/services', {
            title: 'Invoice Services Catalog',
            services,
            search
        });
    } catch (error) {
        console.error('Error in getServices:', error);
        req.flash('error_msg', 'Error loading services');
        res.redirect('/admin/invoice-system');
    }
};

exports.saveService = async (req, res) => {
    try {
        const data = { ...req.body };
        if (!data.id) delete data.id;

        let service;
        if (data.id) {
            service = await InvoiceService.findByIdAndUpdate(data.id, data, { new: true });
            await logActivity(req, 'UPDATE', 'Service', `Updated service ${service.name}`, service._id);
        } else {
            service = await InvoiceService.create(data);
            await logActivity(req, 'CREATE', 'Service', `Created service ${service.name}`, service._id);
        }
        if (req.xhr) return res.json({ success: true, service });
        req.flash('success_msg', `Service ${service.name} saved successfully`);
        res.redirect('/admin/invoice-system/services');
    } catch (error) {
        console.error('Error in saveService:', error);
        if (req.xhr) return res.status(500).json({ success: false, message: error.message });
        req.flash('error_msg', 'Failed to save service: ' + error.message);
        res.redirect('/admin/invoice-system/services');
    }
};

exports.deleteService = async (req, res) => {
    try {
        const service = await InvoiceService.findByIdAndDelete(req.params.id);
        if (service) {
            await logActivity(req, 'DELETE', 'Service', `Deleted service ${service.name}`, service._id);
        }
        req.flash('success_msg', 'Service deleted successfully');
        res.redirect('/admin/invoice-system/services');
    } catch (error) {
        console.error('Error in deleteService:', error);
        req.flash('error_msg', 'Error deleting service');
        res.redirect('/admin/invoice-system/services');
    }
};

// ====================================================
// TEMPLATES MANAGEMENT
// ====================================================
exports.getTemplates = async (req, res) => {
    try {
        await seedDefaultTemplates();
        const templates = await InvoiceTemplate.find().sort({ createdAt: 1 });
        res.render('admin/invoice-system/templates', {
            title: 'Invoice Templates',
            templates
        });
    } catch (error) {
        console.error('Error in getTemplates:', error);
        req.flash('error_msg', 'Error loading templates');
        res.redirect('/admin/invoice-system');
    }
};

exports.setDefaultTemplate = async (req, res) => {
    try {
        await InvoiceTemplate.updateMany({}, { isDefault: false });
        await InvoiceTemplate.findByIdAndUpdate(req.params.id, { isDefault: true });
        req.flash('success_msg', 'Default template updated');
        res.redirect('/admin/invoice-system/templates');
    } catch (error) {
        req.flash('error_msg', 'Error setting default template');
        res.redirect('/admin/invoice-system/templates');
    }
};

exports.saveTemplate = async (req, res) => {
    try {
        const { id, primaryColor, secondaryColor, fontFamily, description, headerStyle, borderStyle, customNotes } = req.body;
        const layoutConfig = {
            headerStyle: headerStyle || 'standard',
            borderStyle: borderStyle || 'solid',
            customNotes: customNotes || ''
        };
        const template = await InvoiceTemplate.findByIdAndUpdate(id, {
            primaryColor,
            secondaryColor,
            fontFamily,
            description,
            layoutConfig
        }, { new: true });
        await logActivity(req, 'UPDATE', 'Template', `Updated template ${template.name}`, template._id);
        req.flash('success_msg', `Template ${template.name} updated successfully`);
        res.redirect('/admin/invoice-system/templates');
    } catch (error) {
        console.error('Error in saveTemplate:', error);
        req.flash('error_msg', 'Failed to save template: ' + error.message);
        res.redirect('/admin/invoice-system/templates');
    }
};

// ====================================================
// SETTINGS MANAGEMENT
// ====================================================
exports.getSettings = async (req, res) => {
    try {
        const settings = await getOrCreateSettings();
        res.render('admin/invoice-system/settings', {
            title: 'Invoice & Company Settings',
            settings
        });
    } catch (error) {
        console.error('Error in getSettings:', error);
        req.flash('error_msg', 'Error loading settings');
        res.redirect('/admin/invoice-system');
    }
};

const { uploadToCloudinary } = require('../helpers/cloudinaryHelper');

exports.saveSettings = async (req, res) => {
    try {
        const settings = await getOrCreateSettings();
        Object.assign(settings, req.body);

        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.buffer, 'jojo_logos');
            settings.logoUrl = uploadResult.secure_url;
        }

        await settings.save();
        await logActivity(req, 'UPDATE', 'Settings', 'Updated company & invoice settings');
        req.flash('success_msg', 'Settings updated successfully');
        res.redirect('/admin/invoice-system/settings');
    } catch (error) {
        console.error('Error in saveSettings:', error);
        req.flash('error_msg', 'Failed to save settings: ' + error.message);
        res.redirect('/admin/invoice-system/settings');
    }
};

// ====================================================
// REPORTS & ANALYTICS
// ====================================================
exports.getReports = async (req, res) => {
    try {
        const payments = await Payment.find();
        const invoices = await Invoice.find();

        // Calculate monthly sales for the past 6 months
        const monthlyData = [];
        const monthLabels = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const m = d.getMonth();
            const y = d.getFullYear();
            monthLabels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));

            const total = payments.filter(p => {
                const pd = new Date(p.paymentDate);
                return pd.getMonth() === m && pd.getFullYear() === y;
            }).reduce((sum, p) => sum + p.amount, 0);

            monthlyData.push(total);
        }

        const totalGst = invoices.reduce((acc, inv) => acc + (inv.gstTotal || 0), 0);
        const totalSales = payments.reduce((acc, p) => acc + p.amount, 0);
        const pendingTotal = invoices.filter(inv => inv.status !== 'Paid').reduce((acc, inv) => acc + inv.balanceDue, 0);

        res.render('admin/invoice-system/reports', {
            title: 'Financial Reports & Analytics',
            monthLabels: JSON.stringify(monthLabels),
            monthlyData: JSON.stringify(monthlyData),
            totalGst,
            totalSales,
            pendingTotal
        });
    } catch (error) {
        console.error('Error in getReports:', error);
        req.flash('error_msg', 'Error loading reports');
        res.redirect('/admin/invoice-system');
    }
};

// ====================================================
// AUDIT LOGS
// ====================================================
exports.getLogs = async (req, res) => {
    try {
        const logs = await InvoiceActivityLog.find().sort({ createdAt: -1 }).limit(100);
        res.render('admin/invoice-system/logs', {
            title: 'Activity & Audit Logs',
            logs
        });
    } catch (error) {
        console.error('Error in getLogs:', error);
        req.flash('error_msg', 'Error loading activity logs');
        res.redirect('/admin/invoice-system');
    }
};

// ====================================================
// PRINT & PDF VIEW
// ====================================================
exports.getPrintView = async (req, res) => {
    try {
        const { type, id } = req.params;
        let doc, settings;
        settings = await getOrCreateSettings();

        if (type === 'estimate') {
            doc = await Estimate.findById(id);
        } else {
            doc = await Invoice.findById(id);
        }

        if (!doc) {
            return res.status(404).send('Document not found');
        }

        const upiQrUrl = generateUpiQrUrl(doc.companyDetails.upiId || settings.upiId, doc.companyDetails.companyName || settings.companyName, doc.balanceDue || doc.grandTotal);

        res.render('admin/invoice-system/print-view', {
            layout: false, // Pure A4 layout without admin navbar/sidebar
            docType: type,
            doc,
            settings,
            upiQrUrl
        });
    } catch (error) {
        console.error('Error in getPrintView:', error);
        res.status(500).send('Error rendering print view');
    }
};
