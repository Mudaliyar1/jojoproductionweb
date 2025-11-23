const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Service = require('../models/Service');
const TeamMember = require('../models/TeamMember');
const Inquiry = require('../models/Inquiry');
const About = require('../models/About');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Use the admin layout for every admin view and set active menu
router.use((req, res, next) => {
    // Ensure all admin views use the admin layout
    const originalRender = res.render.bind(res);
    res.render = (view, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        options = options || {};
        if (options.layout === undefined) options.layout = 'admin/layout';
        return originalRender(view, options, callback);
    };

    // Active nav state
    const p = req.path;
    if (p.startsWith('/dashboard')) res.locals.active = 'dashboard';
    else if (p.startsWith('/users')) res.locals.active = 'users';
    else if (p.startsWith('/inquiries')) res.locals.active = 'inquiries';
    else if (p.startsWith('/services')) res.locals.active = 'services';
    else if (p.startsWith('/about')) res.locals.active = 'about';
    else if (p.startsWith('/team')) res.locals.active = 'team';

    next();
});

// Admin index -> redirect to dashboard
router.get('/', isAdmin, (req, res) => {
    return res.redirect('/admin/dashboard');
});

// Dashboard home
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const stats = {
            totalUsers: await User.countDocuments(),
            totalInquiries: await Inquiry.countDocuments(),
            totalServices: await Service.countDocuments(),
            totalTeamMembers: await TeamMember.countDocuments()
        };
        const recentInquiries = await Inquiry.find().sort({ createdAt: -1 }).limit(5);
        
        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            stats,
            recentInquiries,
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            stats: { totalUsers: 0, totalInquiries: 0, totalServices: 0, totalTeamMembers: 0 },
            layout: 'admin/layout'
        });
    }
});

// User Management
router.get('/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.render('admin/users', { 
            title: 'User Management',
            users,
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Users error:', error);
        res.render('admin/users', { 
            title: 'User Management',
            users: [],
            layout: 'admin/layout'
        });
    }
});

// Add user
router.post('/users/add', isAdmin, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const user = new User({ name, email, password, role });
        await user.save();
        req.flash('success_msg', 'User added successfully');
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Add user error:', error);
        req.flash('error_msg', 'Error adding user');
        res.redirect('/admin/users');
    }
});

// Edit user
router.post('/users/edit/:id', isAdmin, async (req, res) => {
    try {
        const { name, email, role } = req.body;
        await User.findByIdAndUpdate(req.params.id, { name, email, role });
        req.flash('success_msg', 'User updated successfully');
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Edit user error:', error);
        req.flash('error_msg', 'Error updating user');
        res.redirect('/admin/users');
    }
});

// Delete user
router.post('/users/delete/:id', isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'User deleted successfully');
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Delete user error:', error);
        req.flash('error_msg', 'Error deleting user');
        res.redirect('/admin/users');
    }
});

// Inquiry Management
router.get('/inquiries', isAdmin, async (req, res) => {
    try {
        const { eventType, heardAbout, status } = req.query;
        let query = {};
        
        if (eventType) query.eventType = eventType;
        if (heardAbout) query.heardAbout = heardAbout;
        if (status) query.status = status;
        
        const inquiries = await Inquiry.find(query).sort({ createdAt: -1 });
        res.render('admin/inquiries', { 
            title: 'Inquiry Management',
            inquiries,
            filters: { eventType, heardAbout, status },
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Inquiries error:', error);
        res.render('admin/inquiries', { 
            title: 'Inquiry Management',
            inquiries: [],
            filters: {},
            layout: 'admin/layout'
        });
    }
});

// View inquiry details
router.get('/inquiries/:id', isAdmin, async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        if (!inquiry) {
            req.flash('error_msg', 'Inquiry not found');
            return res.redirect('/admin/inquiries');
        }
        
        // Mark as viewed
        if (inquiry.status === 'new') {
            inquiry.status = 'viewed';
            await inquiry.save();
        }
        
        res.render('admin/inquiry-detail', { 
            title: 'Inquiry Details',
            inquiry,
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Inquiry detail error:', error);
        req.flash('error_msg', 'Error loading inquiry details');
        res.redirect('/admin/inquiries');
    }
});

// Update inquiry status
router.put('/inquiries/status/:id', isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await Inquiry.findByIdAndUpdate(req.params.id, { status });
        res.json({ success: true });
    } catch (error) {
        console.error('Update inquiry status error:', error);
        res.json({ success: false, error: 'Error updating status' });
    }
});

// Delete inquiry
router.delete('/inquiries/delete/:id', isAdmin, async (req, res) => {
    try {
        await Inquiry.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Inquiry deleted successfully');
        res.redirect('/admin/inquiries');
    } catch (error) {
        console.error('Delete inquiry error:', error);
        req.flash('error_msg', 'Error deleting inquiry');
        res.redirect('/admin/inquiries');
    }
});

// Service Management
router.get('/services', isAdmin, async (req, res) => {
    try {
        const services = await Service.find().sort({ createdAt: -1 });
        res.render('admin/services', { 
            title: 'Service Management',
            services,
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Services error:', error);
        res.render('admin/services', { 
            title: 'Service Management',
            services: [],
            layout: 'admin/layout'
        });
    }
});

// Add service form
router.get('/services/add', isAdmin, (req, res) => {
    res.render('admin/service-form', { 
        title: 'Add Service',
        service: null,
        layout: 'admin/layout'
    });
});

// Edit service form
router.get('/services/edit/:id', isAdmin, async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (!service) {
            req.flash('error_msg', 'Service not found');
            return res.redirect('/admin/services');
        }
        res.render('admin/service-form', { 
            title: 'Edit Service',
            service,
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Edit service form error:', error);
        req.flash('error_msg', 'Error loading service');
        res.redirect('/admin/services');
    }
});

// Add service
router.post('/services/add', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { title, description, featured } = req.body;
        const service = new Service({
            title,
            description,
            image: req.file ? `/uploads/${req.file.filename}` : '',
            featured: featured === 'on'
        });
        await service.save();
        req.flash('success_msg', 'Service added successfully');
        res.redirect('/admin/services');
    } catch (error) {
        console.error('Add service error:', error);
        req.flash('error_msg', 'Error adding service');
        res.redirect('/admin/services');
    }
});

// Edit service
router.post('/services/edit/:id', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { title, description, featured } = req.body;
        const updateData = {
            title,
            description,
            featured: featured === 'on'
        };
        
        if (req.file) {
            updateData.image = `/uploads/${req.file.filename}`;
        }
        
        await Service.findByIdAndUpdate(req.params.id, updateData);
        req.flash('success_msg', 'Service updated successfully');
        res.redirect('/admin/services');
    } catch (error) {
        console.error('Edit service error:', error);
        req.flash('error_msg', 'Error updating service');
        res.redirect('/admin/services');
    }
});

// Delete service
router.post('/services/delete/:id', isAdmin, async (req, res) => {
    try {
        await Service.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Service deleted successfully');
        res.redirect('/admin/services');
    } catch (error) {
        console.error('Delete service error:', error);
        req.flash('error_msg', 'Error deleting service');
        res.redirect('/admin/services');
    }
});

// About Management
router.get('/about', isAdmin, async (req, res) => {
    try {
        let about = await About.findOne();
        if (!about) {
            about = new About({
                content: 'Welcome to Jojo\'s Production. This is a placeholder for the About section content. Please update it through the admin panel.',
                mission: 'Our mission is to craft beautiful moments into lasting memories.',
                story: 'Jojo\'s Production was founded with a passion for storytelling through visual media.'
            });
        }
        // Always ensure the content is the placeholder and save
        about.content = 'Welcome to Jojo\'s Production. This is a placeholder for the About section content. Please update it through the admin panel.';
        await about.save();
        
        const teamMembers = await TeamMember.find().sort({ order: 1 });
        res.render('admin/about', { 
            title: 'About Management',
            about,
            teamMembers,
            errors: {},
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('About error:', error);
        res.render('admin/about', { 
            title: 'About Management',
            about: null,
            teamMembers: [],
            errors: {},
            layout: 'admin/layout'
        });
    }
});

// Team management page
router.get('/team', isAdmin, async (req, res) => {
    try {
        const teamMembers = await TeamMember.find().sort({ order: 1 });
        res.render('admin/team', { 
            title: 'Team Management',
            teamMembers,
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Team error:', error);
        res.render('admin/team', { 
            title: 'Team Management',
            teamMembers: [],
            layout: 'admin/layout'
        });
    }
});

// Add team member form
router.get('/team/add', isAdmin, (req, res) => {
    res.render('admin/team-member-form', { 
        title: 'Add Team Member',
        teamMember: null,
        layout: 'admin/layout'
    });
});

// Edit team member form
router.get('/team/edit/:id', isAdmin, async (req, res) => {
    try {
        const teamMember = await TeamMember.findById(req.params.id);
        if (!teamMember) {
            req.flash('error_msg', 'Team member not found');
            return res.redirect('/admin/team');
        }
        res.render('admin/team-member-form', { 
            title: 'Edit Team Member',
            teamMember,
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Edit team member form error:', error);
        req.flash('error_msg', 'Error loading team member');
        res.redirect('/admin/team');
    }
});

// Update about content
router.post('/about/update', isAdmin, async (req, res) => {
    try {
        const { mission, story } = req.body;
        let about = await About.findOne();
        
        if (about) {
            about.content = 'Welcome to Jojo\'s Production. This is a placeholder for the About section content. Please update it through the admin panel.';
            about.mission = mission;
            about.story = story;
            await about.save();
        } else {
            about = new About({ content: 'Welcome to Jojo\'s Production. This is a placeholder for the About section content. Please update it through the admin panel.', mission, story });
            await about.save();
        }
        
        req.flash('success_msg', 'About content updated successfully');
        res.redirect('/admin/about');
    } catch (error) {
        console.error('Update about error:', error);
        req.flash('error_msg', 'Error updating about content');
        res.redirect('/admin/about');
    }
});

// Add team member
router.post('/about/team/add', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, role, description, order } = req.body;
        const teamMember = new TeamMember({
            name,
            role,
            description,
            image: req.file ? `/uploads/${req.file.filename}` : '',
            order: parseInt(order) || 0
        });
        await teamMember.save();
        req.flash('success_msg', 'Team member added successfully');
        res.redirect('/admin/about');
    } catch (error) {
        console.error('Add team member error:', error);
        req.flash('error_msg', 'Error adding team member');
        res.redirect('/admin/about');
    }
});

// Edit team member
router.post('/about/team/edit/:id', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, role, description, order } = req.body;
        const updateData = {
            name,
            role,
            description,
            order: parseInt(order) || 0
        };
        
        if (req.file) {
            updateData.image = `/uploads/${req.file.filename}`;
        }
        
        await TeamMember.findByIdAndUpdate(req.params.id, updateData);
        req.flash('success_msg', 'Team member updated successfully');
        res.redirect('/admin/about');
    } catch (error) {
        console.error('Edit team member error:', error);
        req.flash('error_msg', 'Error updating team member');
        res.redirect('/admin/about');
    }
});

// Delete team member
router.post('/about/team/delete/:id', isAdmin, async (req, res) => {
    try {
        await TeamMember.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Team member deleted successfully');
        res.redirect('/admin/about');
    } catch (error) {
        console.error('Delete team member error:', error);
        req.flash('error_msg', 'Error deleting team member');
        res.redirect('/admin/about');
    }
});

module.exports = router;