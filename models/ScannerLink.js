const mongoose = require('mongoose');
const crypto = require('crypto');

const scannerLinkSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: () => crypto.randomBytes(24).toString('hex')
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: [true, 'Scanner name / Gate name is required'],
        trim: true
    },
    gateNumber: {
        type: String,
        default: '',
        trim: true
    },
    staffName: {
        type: String,
        default: '',
        trim: true
    },
    staffPhone: {
        type: String,
        default: '',
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'DISABLED'],
        default: 'ACTIVE'
    },
    validFrom: {
        type: Date,
        default: null
    },
    validUntil: {
        type: Date,
        default: null
    },
    totalScans: {
        type: Number,
        default: 0
    },
    successfulEntries: {
        type: Number,
        default: 0
    },
    rejectedEntries: {
        type: Number,
        default: 0
    },
    alreadyCheckedInScans: {
        type: Number,
        default: 0
    },
    wrongEventScans: {
        type: Number,
        default: 0
    },
    lastActiveTime: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ScannerLink', scannerLinkSchema);
