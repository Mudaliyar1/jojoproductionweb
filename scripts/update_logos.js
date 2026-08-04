const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require('mongoose');
require('dotenv').config();
const InvoiceSettings = require('../models/InvoiceSettings');
const Invoice = require('../models/Invoice');
const Estimate = require('../models/Estimate');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const s = await InvoiceSettings.findOne().lean();
    if (s && s.logoUrl) {
        const invoices = await Invoice.find();
        for (let inv of invoices) {
            if (!inv.companyDetails || !inv.companyDetails.logoUrl || !inv.companyDetails.logoUrl.startsWith('http')) {
                inv.companyDetails.logoUrl = s.logoUrl;
                await inv.save();
            }
        }
        const estimates = await Estimate.find();
        for (let est of estimates) {
            if (!est.companyDetails || !est.companyDetails.logoUrl || !est.companyDetails.logoUrl.startsWith('http')) {
                est.companyDetails.logoUrl = s.logoUrl;
                await est.save();
            }
        }
        console.log('Successfully updated existing documents to Cloudinary logoUrl:', s.logoUrl);
    }
    process.exit(0);
});
