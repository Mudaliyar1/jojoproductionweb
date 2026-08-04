const mongoose = require('mongoose');

const invoiceServiceSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'General', trim: true },
    priceType: { type: String, enum: ['fixed', 'range'], default: 'fixed' },
    defaultPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 18 },
    unit: { type: String, default: 'Event', trim: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, {
    timestamps: true
});

module.exports = mongoose.model('InvoiceService', invoiceServiceSchema);
