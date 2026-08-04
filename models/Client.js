const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    altMobile: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    panNumber: { type: String, default: '', trim: true },
    address: { type: String, default: '' },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    country: { type: String, default: 'India', trim: true },
    pincode: { type: String, default: '', trim: true },
    eventName: { type: String, default: '', trim: true },
    eventDate: { type: Date },
    venue: { type: String, default: '' },
    notes: { type: String, default: '' }
}, {
    timestamps: true
});

module.exports = mongoose.model('Client', clientSchema);
