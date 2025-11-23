# Deployment Guide

## Production Deployment

### 1. Environment Variables
Set these environment variables on your production server:

```bash
# Required
MONGODB_URI=mongodb://username:password@host:port/database
SESSION_SECRET=your-very-secure-secret-key
NODE_ENV=production

# Optional (defaults shown)
PORT=3000
```

### 2. MongoDB Setup
- Create a MongoDB database
- Create a database user with read/write permissions
- Update the `MONGODB_URI` in your environment variables

### 3. Server Setup
```bash
# Install dependencies
npm install

# Start the application
npm start
```

### 4. Process Management (Recommended)
Use PM2 for production process management:
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start app.js --name "jojoproduction"

# Save PM2 configuration
pm2 save
pm2 startup
```

### 5. Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /public/uploads {
        alias /path/to/your/app/public/uploads;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 6. SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

### 7. File Permissions
Ensure proper permissions for uploads:
```bash
# Create uploads directory if it doesn't exist
mkdir -p public/uploads

# Set permissions
chmod 755 public/uploads
chown -R your-user:your-group public/uploads
```

## Development vs Production

### Development
- Uses local MongoDB
- Debug mode enabled
- Error messages detailed
- Hot reload available

### Production
- Uses remote MongoDB
- Debug mode disabled
- Error messages generic
- Performance optimized
- Logging configured

## Monitoring

### Application Health
- Check if app responds: `curl -I http://localhost:3000`
- Monitor logs: `pm2 logs jojoproduction`
- Check status: `pm2 status`

### Database Health
- Monitor MongoDB connection
- Check database size and performance
- Set up database backups

## Security Checklist

- [ ] Change default session secret
- [ ] Use HTTPS in production
- [ ] Set up firewall rules
- [ ] Regular security updates
- [ ] Database access restrictions
- [ ] File upload limits configured
- [ ] Input validation enabled
- [ ] Error handling configured
- [ ] Logging enabled
- [ ] Backup strategy in place

## Troubleshooting

### Common Issues
1. **Port already in use**: Change PORT in environment variables
2. **Database connection failed**: Check MongoDB URI and credentials
3. **File upload errors**: Check upload directory permissions
4. **Memory issues**: Monitor with PM2 and adjust as needed

### Log Files
- Application logs: Check PM2 logs or console output
- Database logs: Check MongoDB logs
- System logs: `/var/log/` directory

## Support

For deployment assistance, refer to the README.md file or contact the development team.