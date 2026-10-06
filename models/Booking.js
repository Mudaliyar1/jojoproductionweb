const mongoose = require('mongoose');
const crypto = require('crypto');

const bookingSchema = new mongoose.Schema({
    bookingId: {
        type: String,
        required: true,
        unique: true,
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
        required: [true, 'Customer name is required'],
        trim: true
    },
    customerMobile: {
        type: String,
        required: [true, 'Mobile number is required'],
        trim: true
    },
    customerEmail: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    unitPrice: {
        type: Number,
        required: true,
        min: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentStatus: {
        type: String,
        enum: ['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED'],
        default: 'COMPLETED'
    },
    paymentId: {
        type: String,
        default: ''
    },
    bookingStatus: {
        type: String,
        enum: ['CONFIRMED', 'CANCELLED'],
        default: 'CONFIRMED'
    },
    bookingToken: {
        type: String,
        required: true,
        unique: true,
        default: () => crypto.randomBytes(16).toString('hex')
    }
}, {
    timestamps: true
});

// Helper static method to generate unique booking ID
bookingSchema.statics.generateBookingId = async function() {
    const year = new Date().getFullYear();
    const prefix = `BKG-${year}-`;
    const count = await this.countDocuments();
    const sequence = String(count + 1).padStart(6, '0');
    return `${prefix}${sequence}`;
};

module.exports = mongoose.model('Booking', bookingSchema);
