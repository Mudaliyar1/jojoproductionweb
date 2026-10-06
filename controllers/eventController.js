const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Ticket = require('../models/Ticket');
const ScannerLink = require('../models/ScannerLink');
const Entry = require('../models/Entry');
const QRCode = require('qrcode');

// ==========================================
// PUBLIC EVENT BOOKING CONTROLLERS
// ==========================================

/**
 * GET /events/:eventSlug/book or /ticket/:eventSlug
 * Renders the clean, mobile-first public booking page with NO ERP BRANDING and NO LOGIN REQUIRED.
 */
exports.getPublicBookingPage = async (req, res) => {
    try {
        const { eventSlug } = req.params;
        const event = await Event.findOne({ slug: eventSlug.toLowerCase() });

        if (!event) {
            return res.status(404).render('404', { 
                layout: false,
                message: 'Event not found'
            });
        }

        // Generate Common Event QR Code Data URI for display on public page if needed
        const host = req.get('host');
        const protocol = req.protocol;
        const bookingUrl = `${protocol}://${host}/events/${event.slug}/book`;
        const qrCodeDataUri = await QRCode.toDataURL(bookingUrl, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
            color: { dark: '#0f172a', light: '#ffffff' }
        });

        res.render('events/public-booking', {
            layout: false, // STRICTLY NO ERP LAYOUT / NO ADMIN NAVIGATION
            event,
            bookingUrl,
            qrCodeDataUri,
            error: req.flash('error_msg'),
            success: req.flash('success_msg')
        });
    } catch (err) {
        console.error('Error rendering public booking page:', err);
        res.status(500).send('Internal Server Error');
    }
};

/**
 * POST /events/:eventSlug/book
 * Processes public ticket booking with ATOMIC RESERVATION to prevent overbooking.
 */
exports.processPublicBooking = async (req, res) => {
    try {
        const { eventSlug } = req.params;
        const { customerName, customerMobile, customerEmail, quantity } = req.body;

        const requestedQty = parseInt(quantity, 10);
        if (isNaN(requestedQty) || requestedQty < 1) {
            return res.status(400).json({ success: false, message: 'Please select a valid ticket quantity.' });
        }

        // Find event first to check booking limits & dates
        const event = await Event.findOne({ slug: eventSlug.toLowerCase() });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found.' });
        }

        if (event.bookingStatus !== 'OPEN') {
            return res.status(400).json({ success: false, message: `Booking is currently ${event.bookingStatus.replace('_', ' ')}.` });
        }

        if (requestedQty < event.minTicketsPerBooking) {
            return res.status(400).json({ success: false, message: `Minimum ${event.minTicketsPerBooking} ticket(s) required per booking.` });
        }

        if (requestedQty > event.maxTicketsPerBooking) {
            return res.status(400).json({ success: false, message: `Maximum limit is ${event.maxTicketsPerBooking} tickets per booking.` });
        }

        // ==========================================
        // ATOMIC DATABASE OPERATION PREVENTING OVERBOOKING
        // ==========================================
        // Condition: bookingStatus is OPEN AND (bookedTickets + requestedQty) <= totalTickets
        const updatedEvent = await Event.findOneAndUpdate(
            {
                _id: event._id,
                bookingStatus: 'OPEN',
                $expr: {
                    $lte: [{ $add: ['$bookedTickets', requestedQty] }, '$totalTickets']
                }
            },
            {
                $inc: { bookedTickets: requestedQty }
            },
            { new: true }
        );

        if (!updatedEvent) {
            // Either sold out or capacity limit reached atomically!
            // Check current status
            const currentEvt = await Event.findById(event._id);
            const remaining = currentEvt ? currentEvt.totalTickets - currentEvt.bookedTickets : 0;
            
            if (remaining <= 0) {
                await Event.findByIdAndUpdate(event._id, { bookingStatus: 'SOLD_OUT' });
            }

            return res.status(400).json({
                success: false,
                message: remaining > 0 
                    ? `Only ${remaining} ticket(s) remaining. Please lower your quantity.`
                    : 'SOLD OUT! All tickets for this event have been booked.'
            });
        }

        // Automatically update event status to SOLD_OUT if capacity reached
        if (updatedEvent.bookedTickets >= updatedEvent.totalTickets) {
            await Event.findByIdAndUpdate(event._id, { bookingStatus: 'SOLD_OUT' });
        }

        // Calculate total amount
        const unitPrice = updatedEvent.ticketPrice || 0;
        const totalAmount = unitPrice * requestedQty;
        const paymentStatus = unitPrice === 0 ? 'COMPLETED' : 'COMPLETED'; // For paid events, can integrate gateway or auto-confirm test flow

        // Generate Booking ID
        const bookingId = await Booking.generateBookingId();

        // Create Booking Record
        const booking = new Booking({
            bookingId,
            event: updatedEvent._id,
            customerName,
            customerMobile,
            customerEmail: customerEmail || '',
            quantity: requestedQty,
            unitPrice,
            totalAmount,
            paymentStatus,
            bookingStatus: 'CONFIRMED'
        });
        await booking.save();

        // Create Individual Tickets or Single Group Ticket according to ticketMode
        const tickets = [];
        const generateCount = updatedEvent.ticketMode === 'SINGLE_GROUP_QR' ? 1 : requestedQty;

        // Atomically increment ticketSequence for this specific event
        const eventWithSeq = await Event.findByIdAndUpdate(
            updatedEvent._id,
            { $inc: { ticketSequence: generateCount } },
            { new: true }
        );
        const startSeq = eventWithSeq.ticketSequence - generateCount + 1;

        for (let i = 0; i < generateCount; i++) {
            const seqNum = startSeq + i;
            const ticketNumber = Ticket.generateTicketNumberForEvent(seqNum);
            const ticket = new Ticket({
                ticketNumber,
                booking: booking._id,
                event: updatedEvent._id,
                customerName,
                customerMobile,
                customerEmail: customerEmail || '',
                ticketIndex: i + 1,
                ticketStatus: 'VALID',
                entryStatus: 'PENDING'
            });
            await ticket.save();
            tickets.push(ticket);
        }

        // Broadcast real-time availability update via WebSocket
        if (req.app.locals.broadcastWebSocket) {
            req.app.locals.broadcastWebSocket({
                type: 'AVAILABILITY_UPDATE',
                eventId: updatedEvent._id,
                totalTickets: updatedEvent.totalTickets,
                bookedTickets: updatedEvent.bookedTickets,
                remainingTickets: updatedEvent.totalTickets - updatedEvent.bookedTickets,
                bookingStatus: updatedEvent.bookedTickets >= updatedEvent.totalTickets ? 'SOLD_OUT' : updatedEvent.bookingStatus
            });
        }

        return res.json({
            success: true,
            message: 'Booking confirmed successfully!',
            bookingToken: booking.bookingToken,
            redirectUrl: `/ticket/view/${booking.bookingToken}`
        });

    } catch (err) {
        console.error('Error processing public booking:', err);
        return res.status(500).json({ success: false, message: 'Server error while processing booking. Please try again.' });
    }
};

/**
 * GET /ticket/view/:bookingToken
 * Public Customer View of Confirmed Booking & Individual Ticket QR Codes.
 */
exports.getPublicTicketView = async (req, res) => {
    try {
        const { bookingToken } = req.params;
        const booking = await Booking.findOne({ bookingToken }).populate('event');

        if (!booking) {
            return res.status(404).render('404', { layout: false, message: 'Ticket booking record not found' });
        }

        const tickets = await Ticket.find({ booking: booking._id });

        // Generate QR code Data URIs for each individual ticket
        const host = req.get('host');
        const protocol = req.protocol;

        const ticketsWithQr = await Promise.all(tickets.map(async (t) => {
            const ticketUrl = `${protocol}://${host}/ticket/verify/${t.ticketToken}`;
            const qrDataUri = await QRCode.toDataURL(t.ticketToken, {
                errorCorrectionLevel: 'H',
                margin: 2,
                width: 250,
                color: { dark: '#0f172a', light: '#ffffff' }
            });
            return {
                ...t.toObject(),
                qrDataUri,
                ticketUrl
            };
        }));

        res.render('events/public-ticket-view', {
            layout: false, // NO ERP BRANDING / NO ADMIN NAVIGATION
            booking,
            event: booking.event,
            tickets: ticketsWithQr
        });
    } catch (err) {
        console.error('Error rendering public ticket view:', err);
        res.status(500).send('Internal Server Error');
    }
};

// ==========================================
// ADMIN EVENT & TICKET MANAGEMENT CONTROLLERS
// ==========================================

/**
 * GET /admin/events
 * List all events with ticket statistics & analytics.
 */
exports.getAdminEventsList = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
        const skip = (page - 1) * limit;

        const totalEventsCount = await Event.countDocuments();
        const totalPages = Math.ceil(totalEventsCount / limit) || 1;

        const events = await Event.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        // Calculate overview totals across all events
        const allEvents = await Event.find();
        let totalCapacity = 0;
        let totalBooked = 0;
        let totalCheckedIn = 0;
        let totalRevenue = 0;

        allEvents.forEach(e => {
            totalCapacity += e.totalTickets || 0;
            totalBooked += e.bookedTickets || 0;
            totalCheckedIn += e.checkedInTickets || 0;
            totalRevenue += (e.bookedTickets || 0) * (e.ticketPrice || 0);
        });

        res.render('admin/events/index', {
            title: 'Event Ticket Management',
            events,
            overview: {
                totalCapacity,
                totalBooked,
                totalRemaining: totalCapacity - totalBooked,
                totalCheckedIn,
                totalNotCheckedIn: totalBooked - totalCheckedIn,
                totalRevenue
            },
            pagination: {
                page,
                limit,
                totalPages,
                totalEventsCount
            },
            active: 'events',
            activeGroup: 'events'
        });
    } catch (err) {
        console.error('Error fetching admin events list:', err);
        req.flash('error_msg', 'Failed to load events.');
        res.redirect('/admin/dashboard');
    }
};

/**
 * GET /admin/events/new
 * Render form to create new event.
 */
exports.getCreateEventForm = (req, res) => {
    res.render('admin/events/form', {
        title: 'Create New Event',
        event: null,
        active: 'events',
        activeGroup: 'events'
    });
};

/**
 * POST /admin/events/create
 * Create a new event and auto-generate unique slug & common QR code.
 */
exports.createEvent = async (req, res) => {
    try {
        const {
            name, description, eventDate, eventTime, venue,
            totalTickets, ticketPrice, ticketType,
            minTicketsPerBooking, maxTicketsPerBooking,
            bookingStatus, ticketMode, requireEmail
        } = req.body;

        let slug = Event.generateSlug(name);
        let existingSlug = await Event.findOne({ slug });
        if (existingSlug) {
            slug = `${slug}-${Date.now().toString().slice(-4)}`;
        }

        const newEvent = new Event({
            name,
            slug,
            description: description || '',
            eventDate: new Date(eventDate),
            eventTime: eventTime || '19:00',
            venue,
            totalTickets: parseInt(totalTickets, 10) || 2500,
            ticketPrice: parseFloat(ticketPrice) || 0,
            ticketType: ticketType || 'ENTRY TICKET',
            minTicketsPerBooking: parseInt(minTicketsPerBooking, 10) || 1,
            maxTicketsPerBooking: parseInt(maxTicketsPerBooking, 10) || 200,
            bookingStatus: bookingStatus || 'OPEN',
            ticketMode: ticketMode || 'INDIVIDUAL_QR',
            requireEmail: requireEmail === 'on' || requireEmail === 'true'
        });

        if (req.file) {
            newEvent.bannerImage = `/uploads/${req.file.filename}`;
        }

        await newEvent.save();

        req.flash('success_msg', `Event "${newEvent.name}" created successfully!`);
        res.redirect(`/admin/events/${newEvent._id}/settings`);
    } catch (err) {
        console.error('Error creating event:', err);
        req.flash('error_msg', 'Failed to create event: ' + err.message);
        res.redirect('/admin/events/new');
    }
};

/**
 * GET /admin/events/:id/settings
 * Ticket Settings & Common QR Code Generator Poster view.
 */
exports.getEventSettings = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            req.flash('error_msg', 'Event not found.');
            return res.redirect('/admin/events');
        }

        const host = req.get('host');
        const protocol = req.protocol;
        const publicBookingUrl = `${protocol}://${host}/events/${event.slug}/book`;

        const qrCodeDataUri = await QRCode.toDataURL(publicBookingUrl, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 350,
            color: { dark: '#0f172a', light: '#ffffff' }
        });

        // Event analytics
        const bookingsCount = await Booking.countDocuments({ event: event._id, bookingStatus: 'CONFIRMED' });
        const ticketsList = await Ticket.find({ event: event._id }).sort({ createdAt: -1 }).limit(10);

        res.render('admin/events/settings', {
            title: `Ticket Settings - ${event.name}`,
            event,
            publicBookingUrl,
            qrCodeDataUri,
            bookingsCount,
            recentTickets: ticketsList,
            active: 'events',
            activeGroup: 'events'
        });
    } catch (err) {
        console.error('Error loading event settings:', err);
        req.flash('error_msg', 'Failed to load event settings.');
        res.redirect('/admin/events');
    }
};

/**
 * POST /admin/events/:id/update
 * Update Event & Ticket Settings with capacity validation (`totalTickets >= bookedTickets`).
 */
exports.updateEventSettings = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            req.flash('error_msg', 'Event not found.');
            return res.redirect('/admin/events');
        }

        const {
            name, description, eventDate, eventTime, venue,
            totalTickets, ticketPrice, ticketType,
            minTicketsPerBooking, maxTicketsPerBooking,
            bookingStatus, ticketMode, requireEmail
        } = req.body;

        const newTotalCapacity = parseInt(totalTickets, 10);
        
        // ADMIN CAPACITY VALIDATION RULE: Total capacity cannot be set lower than already booked count
        if (newTotalCapacity < event.bookedTickets) {
            req.flash('error_msg', `Cannot decrease total capacity to ${newTotalCapacity}. There are already ${event.bookedTickets} tickets booked for this event!`);
            return res.redirect(`/admin/events/${event._id}/settings`);
        }

        event.name = name;
        event.description = description || '';
        event.eventDate = new Date(eventDate);
        event.eventTime = eventTime || '19:00';
        event.venue = venue;
        event.totalTickets = newTotalCapacity;
        event.ticketPrice = parseFloat(ticketPrice) || 0;
        event.ticketType = ticketType || 'ENTRY TICKET';
        event.minTicketsPerBooking = parseInt(minTicketsPerBooking, 10) || 1;
        event.maxTicketsPerBooking = parseInt(maxTicketsPerBooking, 10) || 200;
        event.ticketMode = ticketMode || 'INDIVIDUAL_QR';
        event.requireEmail = requireEmail === 'on' || requireEmail === 'true';

        // Auto calculate status if capacity reached
        if (newTotalCapacity === event.bookedTickets && bookingStatus === 'OPEN') {
            event.bookingStatus = 'SOLD_OUT';
        } else {
            event.bookingStatus = bookingStatus;
        }

        if (req.file) {
            event.bannerImage = `/uploads/${req.file.filename}`;
        }

        await event.save();

        req.flash('success_msg', 'Event & Ticket Settings updated successfully!');
        res.redirect(`/admin/events/${event._id}/settings`);
    } catch (err) {
        console.error('Error updating event settings:', err);
        req.flash('error_msg', 'Failed to update event: ' + err.message);
        res.redirect(`/admin/events/${req.params.id}/settings`);
    }
};

/**
 * GET /admin/events/:id/poster
 * Dedicated Printable Common Event QR Code Poster View.
 */
exports.getEventPoster = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            req.flash('error_msg', 'Event not found.');
            return res.redirect('/admin/events');
        }

        const host = req.get('host');
        const protocol = req.protocol;
        const publicBookingUrl = `${protocol}://${host}/events/${event.slug}/book`;

        const qrCodeDataUri = await QRCode.toDataURL(publicBookingUrl, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 400,
            color: { dark: '#0f172a', light: '#ffffff' }
        });

        res.render('admin/events/poster', {
            layout: false, // Printable standalone poster layout
            event,
            publicBookingUrl,
            qrCodeDataUri
        });
    } catch (err) {
        console.error('Error loading poster:', err);
        res.status(500).send('Error generating poster');
    }
};

/**
 * GET /admin/tickets
 * Admin Ticket Management & Search/Filter Interface.
 */
exports.getAdminTicketsList = async (req, res) => {
    try {
        const { eventId, status, entryStatus, search } = req.query;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
        const skip = (page - 1) * limit;

        const mongoose = require('mongoose');
        const queryConditions = [];

        if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
            queryConditions.push({ event: new mongoose.Types.ObjectId(eventId) });
        }

        if (status) {
            if (status === 'VALID') {
                queryConditions.push({ ticketStatus: { $in: ['VALID', 'CHECKED_IN'] } });
            } else {
                queryConditions.push({ ticketStatus: status });
            }
        }

        if (entryStatus) {
            queryConditions.push({ entryStatus: entryStatus });
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');

            // Find matching bookings by bookingId, customerName, customerMobile
            const matchingBookings = await Booking.find({
                $or: [
                    { bookingId: regex },
                    { customerName: regex },
                    { customerMobile: regex },
                    { customerEmail: regex }
                ]
            }).select('_id');
            const bookingIds = matchingBookings.map(b => b._id);

            queryConditions.push({
                $or: [
                    { ticketNumber: regex },
                    { customerName: regex },
                    { customerMobile: regex },
                    { customerEmail: regex },
                    { booking: { $in: bookingIds } }
                ]
            });
        }

        const finalQuery = queryConditions.length > 0 ? { $and: queryConditions } : {};

        const totalMatchingTickets = await Ticket.countDocuments(finalQuery);
        const totalPages = Math.ceil(totalMatchingTickets / limit) || 1;

        const tickets = await Ticket.find(finalQuery)
            .populate('event')
            .populate('booking')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const events = await Event.find().sort({ name: 1 });

        // Stats summary across all tickets
        const totalTicketsCount = await Ticket.countDocuments();
        const checkedInCount = await Ticket.countDocuments({ entryStatus: 'CHECKED_IN' });
        const pendingCount = await Ticket.countDocuments({ entryStatus: 'PENDING' });
        const cancelledCount = await Ticket.countDocuments({ ticketStatus: 'CANCELLED' });

        res.render('admin/tickets/index', {
            title: 'Ticket Management & Attendance',
            tickets,
            events,
            selectedEvent: eventId || '',
            selectedStatus: status || '',
            selectedEntryStatus: entryStatus || '',
            searchQuery: search || '',
            pagination: {
                page,
                limit,
                totalPages,
                totalMatchingTickets
            },
            stats: {
                totalTicketsCount,
                checkedInCount,
                pendingCount,
                cancelledCount
            },
            active: 'tickets',
            activeGroup: 'events'
        });
    } catch (err) {
        console.error('Error loading admin tickets:', err);
        req.flash('error_msg', 'Failed to load tickets.');
        res.redirect('/admin/dashboard');
    }
};

/**
 * POST /admin/tickets/:id/cancel
 * Cancel ticket and release booked capacity back to event pool.
 */
exports.cancelTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found.' });
        }

        if (ticket.ticketStatus === 'CANCELLED') {
            return res.status(400).json({ success: false, message: 'Ticket is already cancelled.' });
        }

        ticket.ticketStatus = 'CANCELLED';
        await ticket.save();

        // Release capacity on event
        await Event.findByIdAndUpdate(ticket.event, {
            $inc: { bookedTickets: -1 },
            bookingStatus: 'OPEN' // Re-open if was sold out
        });

        return res.json({ success: true, message: 'Ticket cancelled and capacity released successfully.' });
    } catch (err) {
        console.error('Error cancelling ticket:', err);
        return res.status(500).json({ success: false, message: 'Error cancelling ticket.' });
    }
};

/**
 * DELETE or POST /admin/tickets/:id/delete
 * Delete single ticket and update event capacity.
 */
exports.deleteTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found.' });
        }

        const eventId = ticket.event;
        const wasValid = ticket.ticketStatus === 'VALID';

        await Ticket.findByIdAndDelete(req.params.id);

        if (wasValid && eventId) {
            const eventDoc = await Event.findById(eventId);
            if (eventDoc) {
                eventDoc.bookedTickets = Math.max(0, eventDoc.bookedTickets - 1);
                if (eventDoc.bookedTickets < eventDoc.totalTickets && eventDoc.bookingStatus === 'SOLD_OUT') {
                    eventDoc.bookingStatus = 'OPEN';
                }
                await eventDoc.save();
            }
        }

        return res.json({ success: true, message: 'Ticket deleted successfully.' });
    } catch (err) {
        console.error('Error deleting ticket:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete ticket.' });
    }
};

/**
 * POST /admin/tickets/bulk-delete
 * Bulk delete multiple selected tickets.
 */
exports.bulkDeleteTickets = async (req, res) => {
    try {
        const { ticketIds } = req.body;
        if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No tickets selected for deletion.' });
        }

        const tickets = await Ticket.find({ _id: { $in: ticketIds } });
        const affectedEventIds = [...new Set(tickets.map(t => t.event ? t.event.toString() : null).filter(Boolean))];

        await Ticket.deleteMany({ _id: { $in: ticketIds } });

        // Recalculate booked count for affected events
        for (const evtId of affectedEventIds) {
            const count = await Ticket.countDocuments({ event: evtId, ticketStatus: { $ne: 'CANCELLED' } });
            const eventDoc = await Event.findById(evtId);
            if (eventDoc) {
                eventDoc.bookedTickets = count;
                if (eventDoc.bookedTickets < eventDoc.totalTickets && eventDoc.bookingStatus === 'SOLD_OUT') {
                    eventDoc.bookingStatus = 'OPEN';
                }
                await eventDoc.save();
            }
        }

        return res.json({ success: true, deletedCount: tickets.length, message: `Successfully deleted ${tickets.length} ticket(s).` });
    } catch (err) {
        console.error('Error bulk deleting tickets:', err);
        return res.status(500).json({ success: false, message: 'Failed to bulk delete tickets.' });
    }
};

// ==========================================
// STAFF / SECURITY SCANNER CONTROLLERS
// ==========================================

/**
 * GET /admin/scanner
 * Render Camera QR Ticket Scanner UI for Security/Staff.
 */
exports.getScannerPage = async (req, res) => {
    try {
        const events = await Event.find({ bookingStatus: { $ne: 'CANCELLED' } }).sort({ eventDate: -1 });

        res.render('admin/scanner/index', {
            title: 'Staff QR Entry Scanner',
            events,
            active: 'scanner',
            activeGroup: 'events'
        });
    } catch (err) {
        console.error('Error opening scanner:', err);
        req.flash('error_msg', 'Failed to open QR Scanner.');
        res.redirect('/admin/dashboard');
    }
};

/**
 * POST /admin/scanner/validate
 * Validates individual ticket QR code scan result against database.
 */
exports.validateTicketScan = async (req, res) => {
    try {
        const { ticketToken, gate, scannerDevice } = req.body;

        if (!ticketToken) {
            return res.json({
                status: 'INVALID',
                title: '❌ INVALID QR CODE',
                message: 'No readable ticket token found in scanned QR.'
            });
        }

        // Search ticket by ticketToken or ticketNumber
        const ticket = await Ticket.findOne({
            $or: [{ ticketToken }, { ticketNumber: ticketToken.trim().toUpperCase() }]
        }).populate('event').populate('booking');

        if (!ticket) {
            return res.json({
                status: 'INVALID',
                title: '❌ TICKET NOT FOUND',
                message: 'This QR code does not belong to any valid issued ticket.'
            });
        }

        const event = ticket.event;
        if (!event || event.bookingStatus === 'CANCELLED') {
            return res.json({
                status: 'INVALID',
                title: '❌ INVALID EVENT',
                message: 'This event has been cancelled or disabled.'
            });
        }

        if (ticket.ticketStatus === 'CANCELLED') {
            return res.json({
                status: 'CANCELLED',
                title: '❌ CANCELLED TICKET',
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                eventName: event.name,
                message: 'This ticket was cancelled by administration.'
            });
        }

        // Anti-Duplicate Entry Protection
        if (ticket.entryStatus === 'CHECKED_IN') {
            const currentEvt = await Event.findById(event._id);
            return res.json({
                status: 'ALREADY_USED',
                title: '⚠ ALREADY CHECKED IN',
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                eventName: event.name,
                checkedInAt: ticket.checkedInAt ? ticket.checkedInAt.toLocaleString() : 'Earlier',
                checkedInBy: ticket.checkedInBy || 'Security Staff',
                gate: ticket.checkedInGate || 'Main Gate',
                stats: {
                    checkedIn: currentEvt ? currentEvt.checkedInTickets : 0
                },
                message: `Ticket was already checked in at ${ticket.checkedInGate || 'Main Gate'}. DO NOT COUNT AGAIN!`
            });
        }

        // VALID TICKET - Perform Check In
        ticket.entryStatus = 'CHECKED_IN';
        ticket.ticketStatus = 'CHECKED_IN';
        ticket.checkedInAt = new Date();
        ticket.checkedInBy = req.user ? (req.user.name || req.user.email) : 'Security Staff';
        ticket.checkedInGate = gate || 'Main Gate';
        ticket.checkedInScannerDevice = scannerDevice || 'Mobile Scanner';
        await ticket.save();

        // Increment event checked in count atomically and get updated count
        const updatedEvt = await Event.findByIdAndUpdate(
            event._id,
            { $inc: { checkedInTickets: 1 } },
            { new: true }
        );
        const currentCheckedIn = updatedEvt ? updatedEvt.checkedInTickets : 0;

        // Broadcast real-time attendance update
        if (req.app.locals.broadcastWebSocket) {
            req.app.locals.broadcastWebSocket({
                type: 'ATTENDANCE_CHECKIN',
                eventId: event._id.toString(),
                checkedInTickets: currentCheckedIn,
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                checkedInAt: ticket.checkedInAt
            });
        }

        return res.json({
            status: 'VALID',
            title: '✓ VALID TICKET',
            ticketNumber: ticket.ticketNumber,
            customerName: ticket.customerName,
            customerMobile: ticket.customerMobile,
            eventName: event.name,
            venue: event.venue,
            ticketType: event.ticketType,
            quantity: ticket.booking ? ticket.booking.quantity : 1,
            bookingDate: ticket.createdAt ? ticket.createdAt.toLocaleDateString() : '',
            entryStatus: 'CHECKED_IN',
            stats: {
                checkedIn: currentCheckedIn
            },
            message: 'Entry Confirmed! Welcome attendee.'
        });

    } catch (err) {
        console.error('Error validating ticket scan:', err);
        return res.status(500).json({
            status: 'ERROR',
            title: '❌ SYSTEM ERROR',
            message: 'Server error validating ticket scan.'
        });
    }
};

/**
 * POST /admin/scanner/sync-offline
 * Syncs entries recorded while scanner was offline.
 */
exports.syncOfflineEntries = async (req, res) => {
    return res.status(400).json({ success: false, message: 'Offline synchronization disabled. ERP is online-only.' });
};

/**
 * POST /admin/events/:id/delete
 * Delete an event and clean up all associated bookings, tickets, scanner links, and entry logs.
 */
exports.deleteEvent = async (req, res) => {
    try {
        const eventId = req.params.id;
        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found.' });
        }

        // Cascade delete associated records
        await Ticket.deleteMany({ event: eventId });
        await Booking.deleteMany({ event: eventId });
        await ScannerLink.deleteMany({ event: eventId });
        await Entry.deleteMany({ event: eventId });
        await Event.findByIdAndDelete(eventId);

        if (req.app.locals.broadcastWebSocket) {
            req.app.locals.broadcastWebSocket({
                type: 'EVENT_DELETED',
                eventId: eventId.toString()
            });
        }

        req.flash('success_msg', `Event "${event.name}" and associated records deleted.`);
        return res.json({ success: true, message: `Event "${event.name}" deleted successfully.` });

    } catch (err) {
        console.error('Error deleting event:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete event: ' + err.message });
    }
};

// ==========================================
// PUBLIC EVENT SCANNER FOR BODYGUARDS / GATES
// ==========================================

/**
 * GET /scan/event/:token
 * Public scanner page for bodyguards (NO LOGIN REQUIRED, NO ERP BRANDING, NO PWA INSTALL PROMPT).
 */
exports.getPublicScannerPage = async (req, res) => {
    try {
        const { token } = req.params;
        const scannerLink = await ScannerLink.findOne({ token }).populate('event');

        if (!scannerLink) {
            return res.status(404).render('404', {
                layout: false,
                message: 'INVALID SCANNER LINK. This scanner URL does not exist or has been revoked.'
            });
        }

        if (scannerLink.status === 'DISABLED') {
            return res.status(403).render('error', {
                layout: false,
                message: 'SCANNER LINK DISABLED. Contact your event administrator to enable access.'
            });
        }

        const now = new Date();
        if (scannerLink.validUntil && now > scannerLink.validUntil) {
            return res.status(403).render('error', {
                layout: false,
                message: 'SCANNER LINK EXPIRED. The active timeframe for this gate scanner has passed.'
            });
        }

        if (scannerLink.validFrom && now < scannerLink.validFrom) {
            return res.status(403).render('error', {
                layout: false,
                message: 'SCANNER LINK NOT ACTIVE YET. Active timeframe starts later.'
            });
        }

        const event = scannerLink.event;
        if (!event || event.bookingStatus === 'CANCELLED') {
            return res.status(403).render('error', {
                layout: false,
                message: 'EVENT CANCELLED OR INACTIVE.'
            });
        }

        // Generate QR code for this scanner link URL if bodyguard wants to share or print
        const host = req.get('host');
        const protocol = req.protocol;
        const scannerUrl = `${protocol}://${host}/scan/event/${scannerLink.token}`;
        const scannerQrDataUri = await QRCode.toDataURL(scannerUrl, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 250,
            color: { dark: '#0f172a', light: '#ffffff' }
        });

        // Fetch latest event state for authoritative checked-in count
        const currentEvt = await Event.findById(scannerLink.event._id || scannerLink.event);
        const checkedInCount = currentEvt ? (currentEvt.checkedInTickets || 0) : (event.checkedInTickets || 0);

        res.render('events/public-scanner', {
            layout: false, // STRICTLY NO ERP BRANDING / NO ADMIN NAVIGATION
            scannerLink,
            event: currentEvt || event,
            scannerUrl,
            scannerQrDataUri,
            checkedInCount,
            todayScansCount: checkedInCount
        });

    } catch (err) {
        console.error('Error opening public scanner page:', err);
        res.status(500).send('Internal Server Error');
    }
};

/**
 * POST /scan/event/:token/validate
 * Validates ticket scanned by bodyguard on public scanner page.
 * STRICTLY ENFORCES EVENT RESTRICTION: Ticket must belong to scanner's event!
 */
exports.validatePublicScannerScan = async (req, res) => {
    try {
        const { token } = req.params;
        const { ticketToken, deviceInfo } = req.body;

        const scannerLink = await ScannerLink.findOne({ token }).populate('event');
        if (!scannerLink) {
            return res.json({
                status: 'INVALID',
                title: '✕ INVALID SCANNER LINK',
                message: 'This scanner link is invalid or has been revoked.'
            });
        }

        if (scannerLink.status === 'DISABLED') {
            return res.json({
                status: 'DISABLED',
                title: '✕ SCANNER LINK DISABLED',
                message: 'This scanner link has been disabled by event administration.'
            });
        }

        const now = new Date();
        if (scannerLink.validUntil && now > scannerLink.validUntil) {
            return res.json({
                status: 'EXPIRED',
                title: '✕ SCANNER LINK EXPIRED',
                message: 'This scanner link has expired.'
            });
        }

        if (!ticketToken || !ticketToken.trim()) {
            return res.json({
                status: 'INVALID',
                title: '✕ INVALID QR CODE',
                message: 'No readable ticket data found in QR code.'
            });
        }

        // Search ticket by token or number
        const ticket = await Ticket.findOne({
            $or: [{ ticketToken: ticketToken.trim() }, { ticketNumber: ticketToken.trim().toUpperCase() }]
        }).populate('event').populate('booking');

        // Check 1: Ticket Exists
        if (!ticket) {
            await ScannerLink.findByIdAndUpdate(scannerLink._id, {
                $inc: { totalScans: 1, rejectedEntries: 1 },
                lastActiveTime: new Date()
            });
            return res.json({
                status: 'INVALID',
                title: '✕ INVALID TICKET',
                message: 'Ticket could not be verified. Do NOT count entry.'
            });
        }

        // Check 2: STRICT EVENT RESTRICTION (Ticket must belong to scanner's event!)
        if (ticket.event._id.toString() !== scannerLink.event._id.toString()) {
            await ScannerLink.findByIdAndUpdate(scannerLink._id, {
                $inc: { totalScans: 1, rejectedEntries: 1, wrongEventScans: 1 },
                lastActiveTime: new Date()
            });

            await Entry.create({
                event: scannerLink.event._id,
                ticket: ticket._id,
                booking: ticket.booking ? ticket.booking._id : null,
                scannerLink: scannerLink._id,
                scannerName: scannerLink.name,
                gate: scannerLink.gateNumber || scannerLink.name,
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                status: 'WRONG_EVENT',
                rejectionReason: `Ticket belongs to event: ${ticket.event.name}`,
                deviceInfo: deviceInfo || 'Mobile Camera'
            });

            return res.json({
                status: 'WRONG_EVENT',
                title: '✕ WRONG EVENT',
                eventName: scannerLink.event.name,
                ticketEventName: ticket.event.name,
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                message: `This ticket belongs to "${ticket.event.name}". Current scanner is for "${scannerLink.event.name}". Entry Rejected.`
            });
        }

        // Check 3: Ticket Status / Payment Status
        if (ticket.ticketStatus === 'CANCELLED') {
            await ScannerLink.findByIdAndUpdate(scannerLink._id, {
                $inc: { totalScans: 1, rejectedEntries: 1 },
                lastActiveTime: new Date()
            });
            return res.json({
                status: 'CANCELLED',
                title: '✕ CANCELLED TICKET',
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                message: 'This ticket was cancelled. Entry Rejected.'
            });
        }

        if (ticket.booking && (ticket.booking.paymentStatus === 'FAILED' || ticket.booking.paymentStatus === 'PENDING') && scannerLink.event.ticketPrice > 0) {
            await ScannerLink.findByIdAndUpdate(scannerLink._id, {
                $inc: { totalScans: 1, rejectedEntries: 1 },
                lastActiveTime: new Date()
            });
            return res.json({
                status: 'PAYMENT_FAILED',
                title: '✕ PAYMENT NOT COMPLETED',
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                message: 'Payment for this ticket is pending or failed. Entry Rejected.'
            });
        }

        // Check 4: Anti-Duplicate Check-In Protection
        if (ticket.entryStatus === 'CHECKED_IN') {
            await ScannerLink.findByIdAndUpdate(scannerLink._id, {
                $inc: { totalScans: 1, alreadyCheckedInScans: 1 },
                lastActiveTime: new Date()
            });

            await Entry.create({
                event: scannerLink.event._id,
                ticket: ticket._id,
                booking: ticket.booking ? ticket.booking._id : null,
                scannerLink: scannerLink._id,
                scannerName: scannerLink.name,
                gate: scannerLink.gateNumber || scannerLink.name,
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                status: 'ALREADY_CHECKED_IN',
                rejectionReason: 'Already checked in previously',
                deviceInfo: deviceInfo || 'Mobile Camera'
            });

            const currentEvtObj = await Event.findById(scannerLink.event._id);

            return res.json({
                status: 'ALREADY_CHECKED_IN',
                title: '⚠ ALREADY CHECKED IN',
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                checkedInAt: ticket.checkedInAt ? ticket.checkedInAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Earlier',
                checkedInGate: ticket.checkedInGate || 'Previous Gate',
                stats: {
                    checkedIn: currentEvtObj ? currentEvtObj.checkedInTickets : 0
                },
                message: `Ticket was already checked in at ${ticket.checkedInGate || 'Previous Gate'}. DO NOT COUNT AGAIN!`
            });
        }

        // Check 5: SUCCESSFUL ENTRY
        ticket.entryStatus = 'CHECKED_IN';
        ticket.ticketStatus = 'CHECKED_IN';
        ticket.checkedInAt = new Date();
        ticket.checkedInBy = scannerLink.staffName ? `${scannerLink.name} (${scannerLink.staffName})` : scannerLink.name;
        ticket.checkedInGate = scannerLink.gateNumber || scannerLink.name;
        await ticket.save();

        const updatedEvt = await Event.findByIdAndUpdate(
            scannerLink.event._id,
            { $inc: { checkedInTickets: 1 } },
            { new: true }
        );
        const authoritativeCheckedIn = updatedEvt ? updatedEvt.checkedInTickets : 0;

        await ScannerLink.findByIdAndUpdate(scannerLink._id, {
            $inc: { totalScans: 1, successfulEntries: 1 },
            lastActiveTime: new Date()
        });

        const entryRecord = await Entry.create({
            event: scannerLink.event._id,
            ticket: ticket._id,
            booking: ticket.booking._id,
            scannerLink: scannerLink._id,
            scannerName: scannerLink.name,
            gate: scannerLink.gateNumber || scannerLink.name,
            ticketNumber: ticket.ticketNumber,
            customerName: ticket.customerName,
            status: 'APPROVED',
            deviceInfo: deviceInfo || 'Mobile Camera'
        });

        // Broadcast WebSocket real-time update
        if (req.app.locals.broadcastWebSocket) {
            req.app.locals.broadcastWebSocket({
                type: 'ATTENDANCE_CHECKIN',
                eventId: scannerLink.event._id.toString(),
                checkedInTickets: authoritativeCheckedIn,
                ticketNumber: ticket.ticketNumber,
                customerName: ticket.customerName,
                checkedInAt: ticket.checkedInAt,
                scannerName: scannerLink.name,
                gate: scannerLink.gateNumber || scannerLink.name
            });
        }

        return res.json({
            status: 'APPROVED',
            title: '✓ VALID TICKET',
            ticketNumber: ticket.ticketNumber,
            customerName: ticket.customerName,
            eventName: scannerLink.event.name,
            quantity: ticket.booking ? ticket.booking.quantity : 1,
            gate: scannerLink.gateNumber || scannerLink.name,
            scannerName: scannerLink.name,
            entryTime: ticket.checkedInAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            stats: {
                checkedIn: authoritativeCheckedIn
            },
            message: 'ENTRY APPROVED'
        });

    } catch (err) {
        console.error('Error validating public scanner scan:', err);
        return res.status(500).json({
            status: 'ERROR',
            title: '✕ SYSTEM ERROR',
            message: 'Server error validating ticket scan.'
        });
    }
};

/**
 * POST /scan/event/:token/sync-offline
 * Syncs offline entry records uploaded by public bodyguard scanner.
 */
exports.syncPublicScannerOffline = async (req, res) => {
    return res.status(400).json({ success: false, message: 'Offline synchronization disabled. ERP is online-only.' });
};

// ==========================================
// ADMIN SCANNER LINK MANAGEMENT CONTROLLERS
// ==========================================

/**
 * GET /admin/events/:id/scanners
 * Dashboard interface to manage event-specific bodyguard scanner links.
 */
exports.getAdminScannerLinks = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            req.flash('error_msg', 'Event not found.');
            return res.redirect('/admin/events');
        }

        const scannerLinks = await ScannerLink.find({ event: event._id }).sort({ createdAt: -1 });

        const host = req.get('host');
        const protocol = req.protocol;

        // Generate full URL and QR code Data URIs for each scanner link
        const linksWithQr = await Promise.all(scannerLinks.map(async (link) => {
            const scannerUrl = `${protocol}://${host}/scan/event/${link.token}`;
            const qrDataUri = await QRCode.toDataURL(scannerUrl, {
                errorCorrectionLevel: 'H',
                margin: 2,
                width: 250,
                color: { dark: '#0f172a', light: '#ffffff' }
            });
            return {
                ...link.toObject(),
                scannerUrl,
                qrDataUri
            };
        }));

        res.render('admin/events/scanners', {
            title: `Scanner Links - ${event.name}`,
            event,
            scannerLinks: linksWithQr,
            active: 'events',
            activeGroup: 'events'
        });

    } catch (err) {
        console.error('Error fetching scanner links:', err);
        req.flash('error_msg', 'Failed to load scanner links.');
        res.redirect('/admin/events');
    }
};

/**
 * POST /admin/events/:id/scanners/create
 * Create a new scanner link for an event.
 */
exports.createScannerLink = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            req.flash('error_msg', 'Event not found.');
            return res.redirect('/admin/events');
        }

        const { name, gateNumber, staffName, staffPhone, description, validFrom, validUntil, status } = req.body;

        const newLink = new ScannerLink({
            event: event._id,
            name: name || 'Gate Scanner',
            gateNumber: gateNumber || name,
            staffName: staffName || '',
            staffPhone: staffPhone || '',
            description: description || '',
            validFrom: validFrom ? new Date(validFrom) : null,
            validUntil: validUntil ? new Date(validUntil) : null,
            status: status || 'ACTIVE'
        });

        await newLink.save();

        req.flash('success_msg', `Scanner link "${newLink.name}" created successfully!`);
        res.redirect(`/admin/events/${event._id}/scanners`);

    } catch (err) {
        console.error('Error creating scanner link:', err);
        req.flash('error_msg', 'Failed to create scanner link: ' + err.message);
        res.redirect(`/admin/events/${req.params.id}/scanners`);
    }
};

/**
 * POST /admin/scanners/:scannerId/toggle
 * Toggle scanner link active/disabled status.
 */
exports.toggleScannerLink = async (req, res) => {
    try {
        const link = await ScannerLink.findById(req.params.scannerId);
        if (!link) {
            return res.status(404).json({ success: false, message: 'Scanner link not found' });
        }

        link.status = link.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
        await link.save();

        if (req.app.locals.broadcastWebSocket) {
            req.app.locals.broadcastWebSocket({
                type: 'SCANNER_STATUS_CHANGE',
                scannerLinkId: link._id.toString(),
                status: link.status
            });
        }

        return res.json({ success: true, newStatus: link.status, message: `Scanner link is now ${link.status}.` });
    } catch (err) {
        console.error('Error toggling scanner link:', err);
        return res.status(500).json({ success: false, message: 'Error updating scanner link status.' });
    }
};

/**
 * POST /admin/scanners/:scannerId/regenerate
 * Regenerate new random access token for scanner link.
 */
exports.regenerateScannerToken = async (req, res) => {
    try {
        const crypto = require('crypto');
        const link = await ScannerLink.findById(req.params.scannerId);
        if (!link) {
            return res.status(404).json({ success: false, message: 'Scanner link not found' });
        }

        link.token = crypto.randomBytes(24).toString('hex');
        await link.save();

        return res.json({ success: true, message: 'Scanner access token regenerated successfully.' });
    } catch (err) {
        console.error('Error regenerating scanner token:', err);
        return res.status(500).json({ success: false, message: 'Error regenerating token.' });
    }
};

/**
 * DELETE /admin/scanners/:scannerId
 * Delete a scanner link.
 */
exports.deleteScannerLink = async (req, res) => {
    try {
        const link = await ScannerLink.findById(req.params.scannerId);
        if (!link) {
            return res.status(404).json({ success: false, message: 'Scanner link not found' });
        }

        const eventId = link.event;
        await ScannerLink.findByIdAndDelete(req.params.scannerId);

        if (req.app.locals.broadcastWebSocket) {
            req.app.locals.broadcastWebSocket({
                type: 'SCANNER_DELETED',
                scannerLinkId: req.params.scannerId
            });
        }

        req.flash('success_msg', 'Scanner link deleted.');
        return res.json({ success: true, eventId });
    } catch (err) {
        console.error('Error deleting scanner link:', err);
        return res.status(500).json({ success: false, message: 'Error deleting scanner link.' });
    }
};

/**
 * GET /admin/scanners/:scannerId/poster
 * Dedicated Printable Scanner QR Poster for bodyguards.
 */
exports.getScannerPoster = async (req, res) => {
    try {
        const link = await ScannerLink.findById(req.params.scannerId).populate('event');
        if (!link) {
            return res.status(404).send('Scanner link not found');
        }

        const host = req.get('host');
        const protocol = req.protocol;
        const scannerUrl = `${protocol}://${host}/scan/event/${link.token}`;

        const qrCodeDataUri = await QRCode.toDataURL(scannerUrl, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 350,
            color: { dark: '#0f172a', light: '#ffffff' }
        });

        res.render('admin/scanners/poster', {
            layout: false, // Standalone printable poster
            link,
            event: link.event,
            scannerUrl,
            qrCodeDataUri
        });
    } catch (err) {
        console.error('Error loading scanner poster:', err);
        res.status(500).send('Error generating scanner poster');
    }
};

/**
 * GET /admin/events/:id/entry-logs
 * Detailed Entry Log Table for an event.
 */
exports.getAdminEntryLogs = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            req.flash('error_msg', 'Event not found.');
            return res.redirect('/admin/events');
        }

        const { scannerId, status, search } = req.query;
        let query = { event: event._id };

        if (scannerId) query.scannerLink = scannerId;
        if (status) query.status = status;
        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { ticketNumber: regex },
                { customerName: regex },
                { gate: regex },
                { scannerName: regex }
            ];
        }

        const entries = await Entry.find(query)
            .populate('scannerLink')
            .sort({ createdAt: -1 })
            .limit(300);

        const scannerLinks = await ScannerLink.find({ event: event._id });

        res.render('admin/events/entry-logs', {
            title: `Entry Logs - ${event.name}`,
            event,
            entries,
            scannerLinks,
            selectedScanner: scannerId || '',
            selectedStatus: status || '',
            searchQuery: search || '',
            active: 'events',
            activeGroup: 'events'
        });

    } catch (err) {
        console.error('Error fetching entry logs:', err);
        req.flash('error_msg', 'Failed to load entry logs.');
        res.redirect(`/admin/events/${req.params.id}/settings`);
    }
};
