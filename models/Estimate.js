const mongoose = require('mongoose');

const estimateItemSchema = new mongoose.Schema({
    serviceId: { type: String, default: '' },
    description: { type: String, required: true },
    priceType: { type: String, enum: ['fixed', 'range'], default: 'fixed' },
    quantity: { type: Number, default: 1 },
    unit: { type: String, default: 'Event' },
    rate: { type: Number, default: 0 },
    maxRate: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 18 },
    taxAmount: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    maxAmount: { type: Number, default: 0 }
});

const estimateSchema = new mongoose.Schema({
    estimateNumber: { type: String, required: true, unique: true },
    version: { type: Number, default: 1 },
    client: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
        name: { type: String, default: '' },
        mobile: { type: String, default: '' },
        email: { type: String, default: '' },
        address: { type: String, default: '' },
        eventName: { type: String, default: '' },
        eventDate: { type: Date },
        venue: { type: String, default: '' }
    },
    companyDetails: { type: Object, default: {} },
    estimateDate: { type: Date, default: Date.now },
    expiryDate: { type: Date },
    salesPerson: { type: String, default: '' },
    status: { 
        type: String, 
        enum: ['Draft', 'Sent', 'Approved', 'Rejected', 'Converted'], 
        default: 'Draft' 
    },
    items: [estimateItemSchema],
    calcMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    subtotal: { type: Number, default: 0 },
    minTotal: { type: Number, default: 0 },
    maxTotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    gstTotal: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    transportCharges: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    advancePaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    terms: { type: String, default: '' },
    watermark: { type: String, default: 'Estimate' },
    templateId: { type: String, default: 'classic' },
    customStyles: { type: Object, default: {} },
    revisionHistory: [{
        version: { type: Number },
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: String, default: 'Admin' },
        snapshot: { type: Object }
    }],
    createdBy: { type: String, default: 'Admin' }
}, {
    timestamps: true
});

module.exports = mongoose.model('Estimate', estimateSchema);
