const mongoose = require('mongoose');

const aboutSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    mission: {
        type: String,
        required: true
    },
    story: {
        type: String,
        required: true
    },
    logo: {
        type: String,
        default: ''
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
aboutSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('About', aboutSchema);