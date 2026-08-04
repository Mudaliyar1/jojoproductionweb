const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    receiptNumber: { type: String, required: true, unique: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNumber: { type: String, default: '' },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    clientName: { type: String, default: '' },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, default: Date.now },
    paymentMethod: { 
        type: String, 
        enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Debit Card', 'Credit Card', 'Wallet'], 
        default: 'Cash' 
    },
    transactionRef: { type: String, default: '' },
    notes: { type: String, default: '' },
    createdBy: { type: String, default: 'Admin' }
}, {
    timestamps: true
});

module.exports = mongoose.model('Payment', paymentSchema);
