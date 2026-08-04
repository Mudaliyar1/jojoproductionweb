const mongoose = require('mongoose');

const invoiceActivityLogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    module: { type: String, required: true },
    docId: { type: String, default: '' },
    docNumber: { type: String, default: '' },
    user: { type: String, default: 'Admin' },
    ipAddress: { type: String, default: '' },
    details: { type: String, default: '' }
}, {
    timestamps: true
});

module.exports = mongoose.model('InvoiceActivityLog', invoiceActivityLogSchema);
