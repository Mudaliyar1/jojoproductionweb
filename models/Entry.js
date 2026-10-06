const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    ticket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        required: true,
        index: true
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    scannerLink: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ScannerLink',
        required: true
    },
    scannerName: {
        type: String,
        default: 'General Gate'
    },
    gate: {
        type: String,
        default: 'Main Entrance'
    },
    ticketNumber: {
        type: String,
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    entryDate: {
        type: Date,
        default: Date.now
    },
    deviceInfo: {
        type: String,
        default: 'Mobile Web Scanner'
    },
    status: {
        type: String,
        enum: ['APPROVED', 'REJECTED', 'ALREADY_CHECKED_IN', 'WRONG_EVENT', 'INVALID'],
        default: 'APPROVED'
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    isOfflineRecord: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Entry', entrySchema);
