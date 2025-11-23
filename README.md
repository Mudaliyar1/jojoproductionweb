# Jojo's Production Website

A modern, responsive website for Jojo's Production - a professional event production company. Built with Node.js, Express.js, MongoDB, and Bootstrap 5.

## Features

### Frontend
- **Responsive Design**: Mobile-first design with Bootstrap 5
- **Modern UI**: Clean, professional aesthetic with smooth animations
- **Homepage**: Hero section, about preview, featured services, testimonials
- **Services Page**: Service catalog with detailed modal views
- **About Page**: Company story, mission, team members showcase
- **Inquiry System**: Comprehensive contact form with event details
- **Animations**: AOS (Animate On Scroll) for engaging user experience

### Admin Dashboard
- **Authentication**: Secure login system with session management
- **Dashboard**: Statistics overview and recent inquiries
- **User Management**: Admin user creation and management
- **Service Management**: Add, edit, delete services with image uploads
- **Inquiry Management**: View, filter, and manage customer inquiries
- **About Content**: Manage company information and team members
- **File Uploads**: Image upload functionality with Multer

### Technical Features
- **Database**: MongoDB with Mongoose ODM
- **Security**: Input validation, CSRF protection, secure sessions
- **File Handling**: Image uploads with size limits and type validation
- **Responsive**: Works on all devices and screen sizes
- **Performance**: Optimized loading with lazy loading and caching

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd jojoproductionweb
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory with:
   ```
   MONGODB_URI=mongodb://localhost:27017/jojoproduction
   SESSION_SECRET=your-secret-key-here
   NODE_ENV=development
   ```

4. **Start MongoDB**
   Make sure MongoDB is running on your system.

5. **Run the application**
   ```bash
   npm start
   ```

6. **Access the website**
   - Frontend: http://localhost:3000
   - Admin Dashboard: http://localhost:3000/admin/dashboard
   - Login: http://localhost:3000/auth/login

## Default Admin Account

Create the first admin user by registering at `/auth/register`. The first user will automatically be assigned admin privileges.

## Project Structure

```
jojoproductionweb/
├── app.js                    # Main application file
├── middleware/               # Custom middleware
│   └── auth.js              # Authentication middleware
├── models/                   # Database models
│   ├── About.js             # About page content
│   ├── Inquiry.js           # Customer inquiries
│   ├── Service.js           # Services offered
│   ├── TeamMember.js        # Team member profiles
│   └── User.js              # User accounts
├── routes/                   # Application routes
│   ├── admin.js              # Admin dashboard routes
│   ├── auth.js               # Authentication routes
│   └── main.js               # Frontend routes
├── public/                   # Static assets
│   ├── css/                  # Stylesheets
│   ├── images/               # Image assets
│   ├── js/                   # Client-side JavaScript
│   └── uploads/              # Uploaded files
├── views/                    # EJS templates
│   ├── admin/                # Admin dashboard templates
│   ├── auth/                 # Authentication templates
│   ├── partials/             # Reusable template components
│   └── *.ejs                 # Frontend page templates
└── package.json              # Project dependencies
```

## Key Dependencies

- **express**: Web application framework
- **mongoose**: MongoDB object modeling
- **ejs**: Templating engine
- **express-session**: Session management
- **connect-flash**: Flash message middleware
- **bcryptjs**: Password hashing
- **express-validator**: Input validation
- **multer**: File upload handling
- **bootstrap**: Frontend framework
- **aos**: Animation library

## Usage

### Frontend Pages
- **Home**: Showcase of services and company introduction
- **Services**: Detailed service listings with modal views
- **About**: Company story, mission, and team information
- **Inquiry**: Contact form for event inquiries

### Admin Dashboard
1. **Login**: Access the admin panel at `/auth/login`
2. **Dashboard**: Overview of website statistics
3. **Services**: Manage service offerings
4. **Inquiries**: Review and respond to customer inquiries
5. **About**: Update company information and team members
6. **Users**: Manage admin users

### Managing Content

#### Services
- Add new services with images and descriptions
- Mark services as "featured" to highlight them
- Edit existing service information
- Delete services no longer offered

#### Team Members
- Add team member profiles with photos
- Set display order for team page
- Update member information
- Remove team members

#### Inquiries
- View all customer inquiries
- Filter by event type, status, or date
- Update inquiry status (new, viewed, responded, pending)
- Contact customers directly via email or phone

## Security Features

- **Password Hashing**: All passwords are hashed with bcrypt
- **Session Management**: Secure session handling
- **Input Validation**: Server-side validation for all forms
- **File Upload Security**: Image type and size validation
- **Authentication**: Protected admin routes
- **CSRF Protection**: Built-in Express security features

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Optimizations

- **Image Optimization**: Automatic image compression
- **Lazy Loading**: Images load as needed
- **Minified Assets**: CSS and JavaScript optimization
- **Caching**: Efficient browser caching strategies
- **Responsive Images**: Optimized for different screen sizes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is private and proprietary. All rights reserved.

## Support

For technical support or questions, please contact the development team.

---

**Note**: This is a production-ready website with full admin capabilities. Ensure proper security measures are in place when deploying to a live environment.