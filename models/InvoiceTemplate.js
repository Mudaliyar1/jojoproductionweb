const mongoose = require('mongoose');

const invoiceTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    primaryColor: { type: String, default: '#1a252f' },
    secondaryColor: { type: String, default: '#3498db' },
    fontFamily: { type: String, default: 'Poppins' },
    layoutConfig: { type: Object, default: {} }
}, {
    timestamps: true
});

module.exports = mongoose.model('InvoiceTemplate', invoiceTemplateSchema);
