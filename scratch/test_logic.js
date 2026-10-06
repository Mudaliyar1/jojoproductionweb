const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

console.log('Testing EJS compilation of admin tickets/index.ejs...');
const ticketsTemplate = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'tickets', 'index.ejs'), 'utf8');
const compiledTickets = ejs.compile(ticketsTemplate);

const html = compiledTickets({
    tickets: [{
        _id: '507f191e810c19729de860ea',
        ticketNumber: 'JJO-2026-000001',
        customerName: 'Vijay',
        customerMobile: '9999999999',
        customerEmail: 'test@example.com',
        ticketStatus: 'CHECKED_IN',
        entryStatus: 'CHECKED_IN',
        event: { name: 'Techno Night', venue: 'Convention Center' },
        booking: { bookingId: 'BKG-2026-000001', quantity: 2, createdAt: new Date() }
    }],
    events: [{ _id: '507f191e810c19729de860ea', name: 'Techno Night' }],
    selectedEvent: '507f191e810c19729de860ea',
    selectedStatus: 'VALID',
    selectedEntryStatus: 'CHECKED_IN',
    searchQuery: '903366',
    pagination: { page: 1, limit: 10, totalPages: 1, totalMatchingTickets: 1 },
    stats: { totalTicketsCount: 1, checkedInCount: 1, pendingCount: 0, cancelledCount: 0 }
});

console.log('Tickets EJS compiled successfully!');
console.log('Includes VALID badge for CHECKED_IN ticketStatus:', html.includes('VALID'));
console.log('Includes CHECKED IN badge:', html.includes('CHECKED IN'));
