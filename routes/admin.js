const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Service = require('../models/Service');
const TeamMember = require('../models/TeamMember');
const Inquiry = require('../models/Inquiry');
const About = require('../models/About');
const bcrypt = require('bcrypt');
const methodOverride = require('method-override');

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
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed'));
        }
    },
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// Active nav state middleware
router.use((req, res, next) => {
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
            layout: 'admin/layout',
            active: 'dashboard'
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            stats: { totalUsers: 0, totalInquiries: 0, totalServices: 0, totalTeamMembers: 0 },
            layout: 'admin/layout',
            active: 'dashboard'
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
            layout: 'admin/layout',
            active: 'users'
        });
    } catch (error) {
        console.error('Users error:', error);
        res.render('admin/users', {
            title: 'User Management',
            users: [],
            layout: 'admin/layout',
            active: 'users'
        });
    }
});

// Add user form
router.get('/users/add', isAdmin, (req, res) => {
    res.render('admin/user-form', {
        title: 'Add New User',
        user: null,
        layout: 'admin/layout',
        active: 'users'
    });
});

// Edit user form
router.get('/users/edit/:id', isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }
        res.render('admin/user-form', {
            title: 'Edit User',
            user,
            layout: 'admin/layout',
            active: 'users'
        });
    } catch (error) {
        console.error('Edit user form error:', error);
        req.flash('error_msg', 'Error loading user');
        res.redirect('/admin/users');
    }
});

// Add user
router.post('/users/add', isAdmin, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword, role });
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
            layout: 'admin/layout',
            active: 'inquiries'
        });
    } catch (error) {
        console.error('Inquiries error:', error);
        res.render('admin/inquiries', {
            title: 'Inquiry Management',
            inquiries: [],
            filters: { eventType, heardAbout, status },
            layout: 'admin/layout',
            active: 'inquiries'
        });
    }
});

router.get('/inquiries/delete/:id', isAdmin, async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        if (!inquiry) {
            req.flash('error_msg', 'Inquiry not found');
            return res.redirect('/admin/inquiries');
        }
        res.render('admin/inquiry-delete-confirm', {
            title: 'Confirm Delete Inquiry',
            inquiry,
            layout: 'admin/layout',
            active: 'inquiries'
        });
    } catch (error) {
        console.error('Error loading inquiry for deletion:', error);
        req.flash('error_msg', 'Error loading inquiry');
        res.redirect('/admin/inquiries');
    }
});

// Handle inquiry deletion
router.post('/inquiries/delete/:id', isAdmin, async (req, res) => {
    try {
        await Inquiry.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Inquiry deleted successfully');
        res.redirect('/admin/inquiries');
    } catch (error) {
        console.error('Error deleting inquiry:', error);
        req.flash('error_msg', 'Error deleting inquiry');
        res.redirect('/admin/inquiries');
    }
});

// Display bulk delete confirmation page
router.get('/inquiries/bulk-delete-confirm', isAdmin, async (req, res) => {
    try {
        const inquiryIds = req.query.ids ? req.query.ids.split(',') : [];
        const inquiries = await Inquiry.find({ _id: { $in: inquiryIds } });

        res.render('admin/inquiry-bulk-delete-confirm', {
            title: 'Confirm Bulk Delete',
            inquiries,
            layout: 'admin/layout',
            active: 'inquiries'
        });
    } catch (error) {
        console.error('Bulk delete confirmation error:', error);
        req.flash('error_msg', 'Error loading inquiries for bulk deletion.');
        res.redirect('/admin/inquiries');
    }
});

// Handle bulk deletion
router.post('/inquiries/bulk-delete', isAdmin, async (req, res) => {
    try {
        const inquiryIds = req.body.inquiryIds;
        if (!inquiryIds || inquiryIds.length === 0) {
            req.flash('error_msg', 'No inquiries selected for deletion.');
            return res.redirect('/admin/inquiries');
        }

        await Inquiry.deleteMany({ _id: { $in: inquiryIds } });
        req.flash('success_msg', 'Selected inquiries deleted successfully.');
        res.redirect('/admin/inquiries');
    } catch (error) {
        console.error('Bulk deletion error:', error);
        req.flash('error_msg', 'Error deleting selected inquiries.');
        res.redirect('/admin/inquiries');
    }
});

// Export inquiries
router.get('/inquiries/export', isAdmin, async (req, res) => {
    try {
        const { eventType, heardAbout, status, dateFrom, dateTo } = req.query;
        const query = {};

        if (eventType) query.eventType = eventType;
        if (heardAbout) query.heardAbout = heardAbout;
        if (status) query.status = status;
        if (dateFrom || dateTo) {
            query.eventDate = {};
            if (dateFrom) query.eventDate.$gte = new Date(dateFrom);
            if (dateTo) query.eventDate.$lte = new Date(dateTo);
        }

        const inquiries = await Inquiry.find(query).sort({ createdAt: -1 });

        let csv = 'First Name,Last Name,Email,Phone,Event Type,Event Date,Event Location,Number of Guests,Budget Range,Heard About,Newsletter,Preferences,Status,Submitted At\n';
        inquiries.forEach(inquiry => {
            csv += `"${inquiry.firstName}","${inquiry.lastName}","${inquiry.email}","${inquiry.phone}","${inquiry.eventType}","${inquiry.eventDate ? new Date(inquiry.eventDate).toLocaleDateString() : ''}","${inquiry.eventLocation}","${inquiry.numberOfGuests || ''}","${inquiry.budgetRange || ''}","${inquiry.heardAbout}","${inquiry.newsletter ? 'Yes' : 'No'}","${inquiry.preferences || ''}","${inquiry.status}","${inquiry.createdAt ? new Date(inquiry.createdAt).toLocaleString() : ''}"\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('inquiries.csv');
        return res.send(csv);

    } catch (error) {
        console.error('Export inquiries error:', error);
        req.flash('error_msg', 'Error exporting inquiries.');
        res.redirect('/admin/inquiries');
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
        
        res.render('admin/inquiry-details-new', {
            title: 'Inquiry Details',
            inquiry,
            layout: 'admin/layout',
            active: 'inquiries'
        });
    } catch (error) {
        console.error('Inquiry detail error:', error);
        req.flash('error_msg', 'Error loading inquiry details');
        res.redirect('/admin/inquiries');
    }
});

// Update inquiry status
router.post('/inquiries/status/:id', isAdmin, async (req, res) => {
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
            layout: 'admin/layout',
            active: 'services'
        });
    } catch (error) {
        console.error('Services error:', error);
        res.render('admin/services', {
            title: 'Service Management',
            services: [],
            layout: 'admin/layout',
            active: 'services'
        });
    }
});

// Add service form
router.get('/services/add', isAdmin, (req, res) => {
    console.log('Accessed /admin/services/add route'); // Temporary log
    res.render('admin/service-form', {
        title: 'Add Service',
        service: null,
        layout: 'admin/layout',
        active: 'services'
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
            layout: 'admin/layout',
            active: 'services'
        });
    } catch (error) {
        console.error('Edit service form error:', error);
        req.flash('error_msg', 'Error loading service');
        res.redirect('/admin/services');
    }
});

// Add service
router.post('/services/add', isAdmin, upload.fields([{ name: 'images', maxCount: 10 }, { name: 'videos', maxCount: 5 }]), async (req, res) => {
    try {
        const { title, description, featured } = req.body;
        const images = req.files.images ? req.files.images.map(file => `/uploads/${file.filename}`) : [];
        const videos = req.files.videos ? req.files.videos.map(file => `/uploads/${file.filename}`) : [];

        const service = new Service({
            title,
            description,
            images,
            videos,
            featured: !!featured
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
router.post('/services/edit/:id', isAdmin, upload.fields([{ name: 'images', maxCount: 10 }, { name: 'videos', maxCount: 5 }]), async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (!service) {
            req.flash('error_msg', 'Service not found');
            return res.redirect('/admin/services');
        }

        const { title, description, featured } = req.body;
        let images = service.images;
        let videos = service.videos;

        // Handle new image uploads
        if (req.files.images) {
            const newImages = req.files.images.map(file => `/uploads/${file.filename}`);
            images = [...images, ...newImages];
        }

        // Handle new video uploads
        if (req.files.videos) {
            const newVideos = req.files.videos.map(file => `/uploads/${file.filename}`);
            videos = [...videos, ...newVideos];
        }

        // Remove deleted images
        const imagesToDelete = service.images.filter(img => !images.includes(img));
        imagesToDelete.forEach(img => {
            const imagePath = path.join(__dirname, '..', 'public', img);
            fs.unlink(imagePath, err => {
                if (err) console.error('Error deleting image:', imagePath, err);
            });
        });

        // Remove deleted videos
        const videosToDelete = service.videos.filter(vid => !videos.includes(vid));
        videosToDelete.forEach(vid => {
            const videoPath = path.join(__dirname, '..', 'public', vid);
            fs.unlink(videoPath, err => {
                if (err) console.error('Error deleting video:', videoPath, err);
            });
        });;


        
        const updateData = {
            title,
            description,
            images,
            videos,
            featured: !!featured
        };

        await Service.findByIdAndUpdate(req.params.id, updateData, { new: true });
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
            await about.save();
        }
        
        const teamMembers = await TeamMember.find().sort({ order: 1 });
        res.render('admin/about', {
            title: 'About Management',
            about,
            teamMembers,
            errors: {},
            layout: 'admin/layout',
            active: 'about'
        });
    } catch (error) {
        console.error('About error:', error);
        res.render('admin/about', {
            title: 'About Management',
            about: null,
            teamMembers: [],
            errors: {},
            layout: 'admin/layout',
            active: 'about'
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
            layout: 'admin/layout',
            active: 'team'
          });
    } catch (error) {
        console.error('Team error:', error);
        res.render('admin/team', {
            title: 'Team Management',
            teamMembers: [],
            layout: 'admin/layout',
            active: 'team'
          });
    }
});

// Add team member form
router.get('/about/team/add', isAdmin, (req, res) => {
    res.render('admin/team-member-form', {
        title: 'Add Team Member',
        member: null,
        errors: {},
        layout: 'admin/layout',
        active: 'team'
    });
});


// Edit team member form
router.get('/team/edit/:id', isAdmin, async (req, res) => {
    try {
        const member = await TeamMember.findById(req.params.id);
        if (!member) {
            req.flash('error_msg', 'Team member not found');
            return res.redirect('/admin/team');
        }
        res.render('admin/team-member-form', {
            title: 'Edit Team Member',
            member,
            layout: 'admin/layout',
            active: 'team',
            errors: {}
        });
    } catch (error) {
        console.error('Edit team member form error:', error);
        req.flash('error_msg', 'Error loading team member');
        res.redirect('/admin/team');
    }
});

// Update about content
router.post('/about/update', isAdmin, upload.single('logo'), async (req, res) => {
    try {
        const { content, mission, story } = req.body;
        let about = await About.findOne();
        
        if (about) {
            about.content = content;
            about.mission = mission;
            about.story = story;
            if (req.file) {
                about.logo = `/uploads/${req.file.filename}`;
            }
            await about.save();
        } else {
            const logo = req.file ? `/uploads/${req.file.filename}` : '';
            about = new About({ content, mission, story, logo });
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
        res.redirect('/admin/team');
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
        res.redirect('/admin/team');
    } catch (error) {
        console.error('Edit team member error:', error);
        req.flash('error_msg', 'Error updating team member');
        res.redirect('/admin/team');
    }
});

// Delete team member
router.post('/about/team/delete/:id', isAdmin, async (req, res) => {
    try {
        await TeamMember.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Team member deleted successfully');
        res.redirect('/admin/team');
    } catch (error) {
        console.error('Delete team member error:', error);
        req.flash('error_msg', 'Error deleting team member');
        res.redirect('/admin/team');
    }
});

// Placeholder avatar route
router.get('/placeholder-avatar/:initial', (req, res) => {
    const initial = req.params.initial.toUpperCase();
    const size = parseInt(req.query.size) || 40;
    const bgColor = req.query.bgColor || '6c757d'; // Default Bootstrap secondary gray
    const textColor = req.query.textColor || 'ffffff'; // Default white

    const svg = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${size}" height="${size}" fill="#${bgColor}"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#${textColor}" font-size="${size * 0.6}" font-family="Arial, sans-serif">
                ${initial}
            </text>
        </svg>
    `;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
});

module.exports = router;
router.use(methodOverride('_method'));

// GET all users
router.get('/users', isAdmin, async (req, res) => {
    try {
        const locals = {
            title: 'Users',
            description: 'User Management Dashboard'
        };
        const users = await User.find({});
        res.render('admin/users', { locals, users });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// GET user by ID for editing
router.get('/users/:id/edit', isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send('User not found');
        }
        const locals = {
            title: `Edit User: ${user.name}`,
            description: 'Edit user details',
            active: 'users'
        };
        res.render('admin/user-edit', { locals, user, layout: 'admin/layout' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// PUT/PATCH update user by ID
router.put('/users/:id', isAdmin, async (req, res) => {
    try {
        const { name, email, role, password, confirmPassword } = req.body;

        if (password && password !== confirmPassword) {
            // Handle password mismatch error
            return res.status(400).send('Passwords do not match');
        }

        const updateData = { name, email, role };
        if (password) {
            // Hash new password if provided
            const hashedPassword = await bcrypt.hash(password, 10);
            updateData.password = hashedPassword;
        }

        await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.redirect('/admin/users');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// GET user by ID for deletion confirmation
router.get('/users/:id/delete', isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send('User not found');
        }
        const locals = {
            title: `Delete User: ${user.name}`,
            description: 'Confirm user deletion',
            active: 'users'
        };
        res.render('admin/user-delete-confirm', { locals, user, layout: 'admin/layout' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// DELETE user by ID
router.delete('/users/:id', isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.redirect('/admin/users');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});