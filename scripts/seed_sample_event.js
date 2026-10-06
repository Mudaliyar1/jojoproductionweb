const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const mongoose = require('mongoose');
require('dotenv').config();

const Event = require('../models/Event');

async function seedSampleEvent() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB for seeding sample event.');

        let event = await Event.findOne({ slug: 'jojo-dj-night' });
        if (!event) {
            event = new Event({
                name: 'JOJO DJ NIGHT',
                slug: 'jojo-dj-night',
                description: 'The biggest electronic music festival of the year! Experience live DJ performances, high energy light shows, and unforgettable memories.',
                eventDate: new Date('2026-10-15'),
                eventTime: '20:00',
                venue: 'Ahmedabad Convention Center',
                totalTickets: 2500,
                bookedTickets: 0,
                checkedInTickets: 0,
                ticketPrice: 0,
                ticketType: 'ENTRY TICKET',
                minTicketsPerBooking: 1,
                maxTicketsPerBooking: 200,
                bookingStatus: 'OPEN',
                ticketMode: 'INDIVIDUAL_QR'
            });
            await event.save();
            console.log('Sample event "JOJO DJ NIGHT" seeded successfully!');
        } else {
            console.log('Sample event "JOJO DJ NIGHT" already exists.');
        }

        mongoose.connection.close();
    } catch (err) {
        console.error('Error seeding sample event:', err);
        process.exit(1);
    }
}

seedSampleEvent();
