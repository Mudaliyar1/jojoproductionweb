const dns = require('dns');
// Set Google and Cloudflare public DNS servers to resolve MongoDB SRV lookup issues
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const WebSocket = require('ws');

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(async () => {
    console.log('MongoDB connected successfully');
    // Ensure admin users exist
    const User = require('./models/User');
    const adminEmails = ['admin@gmail.com', 'admin@jojoproduction.com'];
    for (const email of adminEmails) {
        let adminUser = await User.findOne({ email });
        if (!adminUser) {
            adminUser = new User({
                name: 'Admin',
                email: email,
                password: 'admin123',
                role: 'admin'
            });
            await adminUser.save();
            console.log(`Default admin user created for ${email}`);
        } else {
            adminUser.password = 'admin123';
            adminUser.role = 'admin';
            await adminUser.save();
            console.log(`Admin user updated for ${email}`);
        }
    }
})
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static('public'));

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: { secure: false }
}));

app.use(flash());

// Global variables for flash messages
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);

app.set('layout', './layouts/main');

app.use((req, res, next) => {
  res.locals.active = req.originalUrl;
  next();
});

app.use('/admin', (req, res, next) => {
  res.locals.layout = 'admin/layout';
  next();
});

// Routes
const mainRoutes = require('./routes/main');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const invoiceRoutes = require('./routes/invoiceRoutes');
  
  app.use('/', mainRoutes);
  app.use('/admin/invoice-system', invoiceRoutes);
  app.use('/admin', adminRoutes);
  app.use('/auth', authRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).render('404');
});

// WebSocket Server
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log('Client connected via WebSocket');

    ws.on('message', message => {
        console.log(`Received: ${message}`);
        // Echo message back to client
        ws.send(`Server received: ${message}`);
    });

    ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
});

// Function to broadcast messages to all connected WebSocket clients
app.locals.broadcastWebSocket = (data) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});