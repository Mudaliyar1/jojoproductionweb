const InvoiceActivityLog = require('../models/InvoiceActivityLog');

const logActivity = async (req, action, moduleName, details = '', docId = '', docNumber = '') => {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') : '';
        const user = req && req.session && req.session.user ? req.session.user.name || req.session.user.email : 'Admin';
        
        await InvoiceActivityLog.create({
            action,
            module: moduleName,
            docId,
            docNumber,
            user,
            ipAddress: ip,
            details
        });
    } catch (err) {
        console.error('Error logging activity:', err);
    }
};

module.exports = {
    logActivity
};
