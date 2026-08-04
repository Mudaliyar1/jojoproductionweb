const mongoose = require('mongoose');

const invoiceSettingsSchema = new mongoose.Schema({
    companyName: { type: String, default: "Jojo's Production" },
    tagline: { type: String, default: "Premium Event & Media Production" },
    logoUrl: { type: String, default: "/images/logo.png" },
    logoSize: { type: Number, default: 75 },
    address: { type: String, default: "123 Film City Road, Studio Hub" },
    phone: { type: String, default: "+91 98765 43210" },
    email: { type: String, default: "contact@jojoproduction.com" },
    website: { type: String, default: "https://jojoproduction.com" },
    instagram: { type: String, default: "@jojoproduction" },
    gstNumber: { type: String, default: "" },
    panNumber: { type: String, default: "" },
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    branchName: { type: String, default: "" },
    upiId: { type: String, default: "" },
    signatureUrl: { type: String, default: "" },
    defaultNotes: { type: String, default: "Thank you for choosing our services. We look forward to making your event successful." },
    defaultTerms: { type: String, default: "1. 50% Advance payment required upon confirmation.\n2. Balance to be cleared on event day.\n3. Taxes as applicable." },
    estimatePrefix: { type: String, default: "EST" },
    invoicePrefix: { type: String, default: "INV" },
    nextEstimateNum: { type: Number, default: 1 },
    nextInvoiceNum: { type: Number, default: 1 }
}, {
    timestamps: true
});

module.exports = mongoose.model('InvoiceSettings', invoiceSettingsSchema);
