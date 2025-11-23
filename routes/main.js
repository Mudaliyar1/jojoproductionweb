const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const TeamMember = require('../models/TeamMember');
const Inquiry = require('../models/Inquiry');
const User = require('../models/User');
const About = require('../models/About');
const { isAuthenticated } = require('../middleware/auth');

// Middleware to pass user data to all views
router.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

router.get('/debug-about', async (req, res) => {
    try {
        const about = await About.findOne();
        if (about) {
            res.send(`About Content: ${about.content}`);
        } else {
            res.send('No About document found.');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching About content.');
    }
});

// Home Page Route
router.get('/', async (req, res) => {
    try {
        const featuredServices = await Service.find({ featured: true }).limit(4);
        const about = await About.findOne();
        // Check if about content contains the repetitive text and update if necessary
        if (about && about.content.includes('hadmin@jojoproduction.com')) {
            about.content = 'Welcome to Jojo\'s Production. This is a placeholder for the About section content. Please update it through the admin panel.';
            await about.save();
        }
        res.render('index', { 
            title: "Jojo's Production - Crafting Moments into Memories",
            featuredServices,
            about,
            active: 'home'
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.render('index', { 
            title: "Jojo's Production - Crafting Moments into Memories",
            featuredServices: [],
            about: null,
            active: 'home'
        });
    }
});

// About page
router.get('/about', async (req, res) => {
    try {
        const about = await About.findOne();
        const teamMembers = await TeamMember.find().sort({ order: 1 });
        res.render('about', { 
            title: "About Jojo's Production",
            about,
            teamMembers,
            active: 'about'
        });
    } catch (error) {
        console.error('Error loading about page:', error);
        res.render('about', { 
            title: "About Jojo's Production",
            about: null,
            teamMembers: [],
            active: 'about'
        });
    }
});

// Services page
router.get('/services', async (req, res) => {
    try {
        const services = await Service.find().sort({ createdAt: -1 });
        res.render('services', { 
            title: "Our Services - Jojo's Production",
            services,
            active: 'services'
        });
    } catch (error) {
        console.error('Error loading services page:', error);
        res.render('services', { 
            title: "Our Services - Jojo's Production",
            services: [],
            active: 'services'
        });
    }
});

router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.render('profile', {
            title: 'User Profile',
            user,
            active: 'profile'
        });
    } catch (error) {
        console.error('Error loading user profile:', error);
        req.flash('error_msg', 'Error loading user profile.');
        res.redirect('/');
    }
});

router.get('/my-inquiries', isAuthenticated, async (req, res) => {
    try {
        const inquiries = await Inquiry.find({ email: req.user.email }).sort({ createdAt: -1 });
        res.render('my-inquiries', {
            title: 'My Inquiries',
            inquiries,
            active: 'my-inquiries'
        });
    } catch (error) {
        console.error('Error loading user inquiries:', error);
        req.flash('error_msg', 'Error loading your inquiries.');
        res.redirect('/');
    }
});

// View inquiry details
router.get('/inquiry-details/:id', isAuthenticated, async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        if (!inquiry || inquiry.email !== req.user.email) {
            req.flash('error_msg', 'Inquiry not found or you do not have permission to view it.');
            return res.redirect('/my-inquiries');
        }
        res.render('inquiry-details', {
            title: 'Inquiry Details',
            inquiry,
            active: 'my-inquiries'
        });
    } catch (error) {
        console.error('Error loading inquiry details:', error);
        req.flash('error_msg', 'Error loading inquiry details.');
        res.redirect('/my-inquiries');
    }
});

// Inquiry page
router.get('/inquiry', (req, res) => {
    res.render('inquiry', { 
        title: "Inquiry - Jojo's Production",
        active: 'inquiry'
    });
});

// Inquiry success page (GET route for PRG pattern)
router.get('/inquiry-success', (req, res) => {
    const inquiry = req.session.lastInquiry;
    if (inquiry) {
        // Convert eventDate back to a Date object
        inquiry.eventDate = new Date(inquiry.eventDate);
        // Clear the inquiry from session after displaying
        delete req.session.lastInquiry;
        res.render('inquiry-success', {
            title: "Thank You - Jojo's Production",
            inquiry,
            active: 'inquiry'
        });
    } else {
        // If no inquiry in session, redirect to inquiry form or home
        res.redirect('/inquiry');
    }
});

// Submit inquiry
router.post('/inquiry', isAuthenticated, async (req, res) => {
    try {
        const { firstName, lastName, email: formEmail, phone, eventType, eventDate, eventLocation, numberOfGuests, budgetRange, heardAbout, newsletter, preferences } = req.body;

        const email = req.user ? req.user.email : formEmail;
        console.log('User submitting inquiry:', req.user);
        console.log('Email used for inquiry:', email);

        const inquiry = new Inquiry({
            firstName,
            lastName,
            email,
            phone,
            eventType,
            eventDate: new Date(eventDate),
            eventLocation,
            numberOfGuests: numberOfGuests || null,
            budgetRange: budgetRange || null,
            heardAbout,
            newsletter: newsletter === 'on',
            preferences
        });

        await inquiry.save();
        req.session.lastInquiry = inquiry;
        res.redirect('/inquiry-success');
    } catch (error) {
        console.error('Error submitting inquiry:', error);
        req.flash('error_msg', 'There was an error submitting your inquiry. Please try again.');
        res.redirect('/inquiry');
    }
});

// Service detail page
router.get('/services/:id', async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (!service) {
            req.flash('error_msg', 'Service not found.');
            return res.redirect('/services');
        }
        console.log('Service images:', service.images);
        console.log('Service videos:', service.videos);
        res.render('service-details', {
            title: service.title + ' - Jojo\'s Production',
            service,
            active: 'services'
        });
    } catch (error) {
        console.error('Error loading service details:', error);
        req.flash('error_msg', 'Error loading service details.');
        res.redirect('/services');
    }
});

module.exports = router;