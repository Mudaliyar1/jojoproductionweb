const mongoose = require('mongoose');
const User = require('../models/User'); // Corrected path
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './.env' }); // Explicitly load .env from project root

const createAdmin = async (email, password, name) => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jojoproduction', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Connected...');

        let user = await User.findOne({ email });
        if (user) {
            console.log('Admin with this email already exists.');
            mongoose.connection.close();
            return;
        }

        // Pass plain text password, User model's pre-save hook will hash it
        user = new User({
            name,
            email,
            password: password, // Pass plain text password
            role: 'admin'
        });

        await user.save();
        console.log('Admin user created successfully:', user);
        mongoose.connection.close();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

// Get admin credentials from command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
    console.log('Usage: node createAdmin.js <email> <password> <name>');
    process.exit(1);
}

const adminEmail = args[0];
const adminPassword = args[1];
const adminName = args[2];

createAdmin(adminEmail, adminPassword, adminName);