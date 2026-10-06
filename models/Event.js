const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Event name is required'],
        trim: true
    },
    slug: {
        type: String,
        required: [true, 'Event slug is required'],
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    description: {
        type: String,
        default: ''
    },
    bannerImage: {
        type: String,
        default: '/images/default-event-banner.jpg'
    },
    logoImage: {
        type: String,
        default: '/images/default-event-logo.png'
    },
    eventDate: {
        type: Date,
        required: [true, 'Event date is required']
    },
    eventTime: {
        type: String,
        default: '19:00'
    },
    venue: {
        type: String,
        required: [true, 'Venue is required'],
        trim: true
    },
    totalTickets: {
        type: Number,
        required: [true, 'Total ticket quantity is required'],
        min: [1, 'Total tickets must be at least 1'],
        default: 2500
    },
    bookedTickets: {
        type: Number,
        default: 0,
        min: 0
    },
    checkedInTickets: {
        type: Number,
        default: 0,
        min: 0
    },
    ticketSequence: {
        type: Number,
        default: 0,
        min: 0
    },
    ticketPrice: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    ticketType: {
        type: String,
        default: 'ENTRY TICKET',
        trim: true
    },
    bookingStartDate: {
        type: Date,
        default: Date.now
    },
    bookingEndDate: {
        type: Date
    },
    minTicketsPerBooking: {
        type: Number,
        default: 1,
        min: 1
    },
    maxTicketsPerBooking: {
        type: Number,
        default: 200,
        min: 1
    },
    ticketMode: {
        type: String,
        enum: ['INDIVIDUAL_QR', 'SINGLE_GROUP_QR'],
        default: 'INDIVIDUAL_QR'
    },
    bookingStatus: {
        type: String,
        enum: ['OPEN', 'CLOSED', 'SOLD_OUT', 'CANCELLED', 'COMPLETED'],
        default: 'OPEN'
    },
    requireEmail: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for remaining tickets
eventSchema.virtual('remainingTickets').get(function() {
    return Math.max(0, this.totalTickets - this.bookedTickets);
});

// Virtual for not checked in count
eventSchema.virtual('notCheckedInTickets').get(function() {
    return Math.max(0, this.bookedTickets - this.checkedInTickets);
});

// Virtual for total revenue
eventSchema.virtual('totalRevenue').get(function() {
    return this.bookedTickets * this.ticketPrice;
});

// Helper method to generate slug from event name
eventSchema.statics.generateSlug = function(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
};

module.exports = mongoose.model('Event', eventSchema);
