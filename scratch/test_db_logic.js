const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const Booking = require('../models/Booking');
const ScannerLink = require('../models/ScannerLink');
const Entry = require('../models/Entry');

const dbUri = process.env.MONGODB_URI;

async function testBackendLogic() {
    try {
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB.');

        // Sync indexes to drop old single-field ticketNumber_1 unique index
        try {
            await Ticket.collection.dropIndex('ticketNumber_1');
            console.log('Successfully dropped old single-field index ticketNumber_1 from MongoDB.');
        } catch (e) {
            console.log('Old index drop result:', e.message);
        }

        await Ticket.syncIndexes();
        console.log('Synced Mongoose indexes for Ticket model.');

        // Clean up test events
        await Event.deleteMany({ slug: { $in: ['test-event-alpha', 'test-event-beta'] } });

        // Create Event Alpha
        const eventA = new Event({
            name: 'Test Event Alpha',
            slug: 'test-event-alpha',
            eventDate: new Date(),
            venue: 'Venue Alpha',
            totalTickets: 10,
            ticketPrice: 0,
            ticketSequence: 0
        });
        await eventA.save();

        // Create Event Beta
        const eventB = new Event({
            name: 'Test Event Beta',
            slug: 'test-event-beta',
            eventDate: new Date(),
            venue: 'Venue Beta',
            totalTickets: 10,
            ticketPrice: 0,
            ticketSequence: 0
        });
        await eventB.save();

        console.log('Created test events Alpha and Beta.');

        // Simulate Booking 1 for Event Alpha (2 tickets)
        const generateCountA = 2;
        const eventAWithSeq = await Event.findByIdAndUpdate(
            eventA._id,
            { $inc: { ticketSequence: generateCountA, bookedTickets: generateCountA } },
            { new: true }
        );

        const ticketsA = [];
        const startSeqA = eventAWithSeq.ticketSequence - generateCountA + 1;
        for (let i = 0; i < generateCountA; i++) {
            const seqNum = startSeqA + i;
            const ticketNumber = Ticket.generateTicketNumberForEvent(seqNum);
            const ticket = new Ticket({
                ticketNumber,
                booking: new mongoose.Types.ObjectId(),
                event: eventA._id,
                customerName: 'Alice',
                customerMobile: '9999999999',
                ticketIndex: i + 1
            });
            await ticket.save();
            ticketsA.push(ticket);
        }

        console.log('Event Alpha Ticket 1:', ticketsA[0].ticketNumber);
        console.log('Event Alpha Ticket 2:', ticketsA[1].ticketNumber);

        // Simulate Booking 1 for Event Beta (1 ticket)
        const generateCountB = 1;
        const eventBWithSeq = await Event.findByIdAndUpdate(
            eventB._id,
            { $inc: { ticketSequence: generateCountB, bookedTickets: generateCountB } },
            { new: true }
        );

        const startSeqB = eventBWithSeq.ticketSequence - generateCountB + 1;
        const ticketNumberB = Ticket.generateTicketNumberForEvent(startSeqB);
        const ticketB = new Ticket({
            ticketNumber: ticketNumberB,
            booking: new mongoose.Types.ObjectId(),
            event: eventB._id,
            customerName: 'Bob',
            customerMobile: '8888888888',
            ticketIndex: 1
        });
        await ticketB.save();

        console.log('Event Beta Ticket 1:', ticketB.ticketNumber);

        // Verify independent sequences
        if (ticketsA[0].ticketNumber === 'JJO-2026-000001' && ticketB.ticketNumber === 'JJO-2026-000001') {
            console.log('✓ SUCCESS: Ticket sequences are independent per event! Both Event Alpha and Event Beta start at JJO-2026-000001.');
        } else {
            console.error('❌ FAIL: Ticket sequences are not independent per event!', ticketsA[0].ticketNumber, ticketB.ticketNumber);
        }

        // Test compound unique index
        try {
            const dupTicket = new Ticket({
                ticketNumber: 'JJO-2026-000001',
                booking: new mongoose.Types.ObjectId(),
                event: eventA._id,
                customerName: 'Duplicate Test',
                customerMobile: '0000000000'
            });
            await dupTicket.save();
            console.error('❌ FAIL: Compound unique index failed to prevent duplicate ticket in same event!');
        } catch (dupErr) {
            console.log('✓ SUCCESS: Compound unique index successfully blocked duplicate ticket JJO-2026-000001 in Event Alpha!');
        }

        // Clean up test events
        await Ticket.deleteMany({ event: { $in: [eventA._id, eventB._id] } });
        await Event.deleteMany({ _id: { $in: [eventA._id, eventB._id] } });

        console.log('Test completed successfully.');
        await mongoose.disconnect();
        process.exit(0);

    } catch (err) {
        console.error('Test error:', err);
        process.exit(1);
    }
}

testBackendLogic();
