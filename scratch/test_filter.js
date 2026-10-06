const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const mongoose = require('mongoose');
require('dotenv').config();

const Event = require('../models/Event');
const Ticket = require('../models/Ticket');

async function cleanupOrphanedTickets() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const allTickets = await Ticket.find();
        const validEvents = (await Event.find()).map(e => e._id.toString());

        let removedCount = 0;
        for (const t of allTickets) {
            if (!t.event || !validEvents.includes(t.event.toString())) {
                await Ticket.findByIdAndDelete(t._id);
                console.log(`Removed orphaned ticket: ${t.ticketNumber} (${t._id})`);
                removedCount++;
            }
        }

        console.log(`Cleaned up ${removedCount} orphaned tickets.`);
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error during cleanup:', err);
    }
}

cleanupOrphanedTickets();
