const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const TeamMember = require('../models/TeamMember');
const Inquiry = require('../models/Inquiry');
const About = require('../models/About');

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
            about
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.render('index', { 
            title: "Jojo's Production - Crafting Moments into Memories",
            featuredServices: [],
            about: null
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
            teamMembers
        });
    } catch (error) {
        console.error('Error loading about page:', error);
        res.render('about', { 
            title: "About Jojo's Production",
            about: null,
            teamMembers: []
        });
    }
});

// Services page
router.get('/services', async (req, res) => {
    try {
        const services = await Service.find().sort({ createdAt: -1 });
        res.render('services', { 
            title: "Our Services - Jojo's Production",
            services
        });
    } catch (error) {
        console.error('Error loading services page:', error);
        res.render('services', { 
            title: "Our Services - Jojo's Production",
            services: []
        });
    }
});

// Inquiry page
router.get('/inquiry', (req, res) => {
    res.render('inquiry', { 
        title: "Inquiry - Jojo's Production"
    });
});

// Submit inquiry
router.post('/inquiry', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            eventType,
            eventDate,
            eventLocation,
            message,
            heardAbout,
            newsletter
        } = req.body;

        const inquiry = new Inquiry({
            firstName,
            lastName,
            email,
            phone,
            eventType,
            eventDate: new Date(eventDate),
            eventLocation,
            message,
            heardAbout,
            newsletter: newsletter === 'on'
        });

        await inquiry.save();
        
        res.render('inquiry-success', {
            title: "Thank You - Jojo's Production",
            inquiry
        });
    } catch (error) {
        console.error('Error submitting inquiry:', error);
        req.flash('error_msg', 'There was an error submitting your inquiry. Please try again.');
        res.redirect('/inquiry');
    }
});

module.exports = router;