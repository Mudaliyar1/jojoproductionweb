const User = require('../models/User');

// Check if user is authenticated
const isAuthenticated = async (req, res, next) => {
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user.id);
            if (user) {
                req.user = user;
                return next();
            }
        } catch (error) {
            console.error('Error fetching user in isAuthenticated:', error);
        }
    }
    req.flash('error_msg', 'Please log in to access this page');
    res.redirect('/auth/login');
};

// Check if user is admin
const isAdmin = async (req, res, next) => {
    if (!req.session.user) {
        req.flash('error_msg', 'Please log in to access this page');
        return res.redirect('/auth/login');
    }

    try {
        const user = await User.findById(req.session.user.id);
        if (user && user.role === 'admin') {
            return next();
        }
        req.flash('error_msg', 'Access denied. Admin privileges required.');
        res.redirect('/');
    } catch (error) {
        req.flash('error_msg', 'An error occurred. Please try again.');
        res.redirect('/');
    }
};

// Set user in response locals
const setUser = async (req, res, next) => {
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user.id);
            res.locals.user = user;
        } catch (error) {
            console.error('Error setting user:', error);
            res.locals.user = null;
        }
    } else {
        res.locals.user = null;
    }
    next();
};

module.exports = {
    isAuthenticated,
    isAdmin,
    setUser
};