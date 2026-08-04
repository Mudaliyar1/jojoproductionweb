const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djgy4sncz',
    api_key: process.env.CLOUDINARY_API_KEY || '467576582723284',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'JaDrH-DnlX4UC9eXO7wD0KYZGZc'
});

exports.uploadToCloudinary = (fileBuffer, folder = 'jojo_logos') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: folder, resource_type: 'auto' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(fileBuffer);
    });
};

exports.cloudinary = cloudinary;
