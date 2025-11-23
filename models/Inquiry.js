const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    eventType: {
        type: String,
        required: true,
        enum: [
            'Wedding Pre-Event(s)',
            'Wedding Ceremony',
            'Wedding Reception',
            'Engagement',
            'Bridal Shower',
            'Baby Shower',
            'Birthday',
            'Corporate Event',
            'Other'
        ]
    },
    eventDate: {
        type: Date,
        required: true
    },
    eventLocation: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    heardAbout: {
        type: String,
        required: true,
        enum: ['Instagram', 'TikTok', 'Facebook', 'Google Search', 'Friends/Family', 'Other']
    },
    newsletter: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['new', 'viewed', 'responded'],
        default: 'new'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Inquiry', inquirySchema);