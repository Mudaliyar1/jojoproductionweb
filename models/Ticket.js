const mongoose = require('mongoose');
const crypto = require('crypto');

const ticketSchema = new mongoose.Schema({
    ticketNumber: {
        type: String,
        required: true,
        index: true
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true,
        index: true
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    customerName: {
        type: String,
        required: true,
        trim: true
    },
    customerMobile: {
        type: String,
        required: true,
        trim: true
    },
    customerEmail: {
        type: String,
        default: ''
    },
    ticketIndex: {
        type: Number,
        default: 1
    },
    ticketToken: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: () => crypto.randomBytes(24).toString('hex')
    },
    ticketStatus: {
        type: String,
        enum: ['VALID', 'CANCELLED', 'CHECKED_IN'],
        default: 'VALID'
    },
    entryStatus: {
        type: String,
        enum: ['PENDING', 'CHECKED_IN'],
        default: 'PENDING'
    },
    checkedInAt: {
        type: Date,
        default: null
    },
    checkedInBy: {
        type: String,
        default: null
    },
    checkedInGate: {
        type: String,
        default: 'Main Gate'
    },
    checkedInScannerDevice: {
        type: String,
        default: 'Web Scanner'
    },
    isOfflineRecord: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Compound unique index ensuring ticket numbers are unique per event, not globally
ticketSchema.index({ event: 1, ticketNumber: 1 }, { unique: true });

// Static helper to generate sequential event-specific ticket number: JJO-2026-000001
ticketSchema.statics.generateTicketNumberForEvent = function(sequenceNumber) {
    const year = new Date().getFullYear();
    const prefix = `JJO-${year}-`;
    return `${prefix}${String(sequenceNumber).padStart(6, '0')}`;
};

// Fallback legacy helper
ticketSchema.statics.generateTicketNumber = async function(eventId) {
    const year = new Date().getFullYear();
    const prefix = `JJO-${year}-`;
    if (!eventId) return `${prefix}${Date.now().toString().slice(-6)}`;
    
    const lastTicket = await this.findOne({ event: eventId, ticketNumber: new RegExp(`^${prefix}`) })
        .sort({ createdAt: -1 })
        .exec();

    let seq = 1;
    if (lastTicket && lastTicket.ticketNumber) {
        const parts = lastTicket.ticketNumber.split('-');
        if (parts.length === 3) {
            const num = parseInt(parts[2], 10);
            if (!isNaN(num)) seq = num + 1;
        }
    }
    return `${prefix}${String(seq).padStart(6, '0')}`;
};

module.exports = mongoose.model('Ticket', ticketSchema);
