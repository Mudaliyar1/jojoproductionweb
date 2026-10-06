const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const mongoose = require('mongoose');
require('dotenv').config();

const Event = require('../models/Event');
const ScannerLink = require('../models/ScannerLink');

async function seedSampleScanner() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB for seeding sample scanner link.');

        const event = await Event.findOne({ slug: 'jojo-dj-night' });
        if (!event) {
            console.error('Event jojo-dj-night not found.');
            process.exit(1);
        }

        let link = await ScannerLink.findOne({ event: event._id, name: 'Main Gate Scanner' });
        if (!link) {
            link = new ScannerLink({
                event: event._id,
                name: 'Main Gate Scanner',
                gateNumber: 'Gate 1 - Main Entrance',
                staffName: 'Vikram Singh',
                staffPhone: '9876543210',
                description: 'Main entrance gate bodyguard scanner',
                status: 'ACTIVE'
            });
            await link.save();
            console.log(`Sample Scanner Link created for JOJO DJ NIGHT!`);
        } else {
            console.log(`Sample Scanner Link already exists.`);
        }

        console.log(`\n========================================`);
        console.log(`PUBLIC BODYGUARD SCANNER URL:`);
        console.log(`http://localhost:8080/scan/event/${link.token}`);
        console.log(`========================================\n`);

        mongoose.connection.close();
    } catch (err) {
        console.error('Error seeding sample scanner:', err);
        process.exit(1);
    }
}

seedSampleScanner();
