/**
 * QR Code Helper for UPI Payments
 */

const generateUpiQrUrl = (upiId, payeeName, amount = 0, currency = 'INR') => {
    if (!upiId) return '';
    const cleanUpi = upiId.trim();
    const cleanName = encodeURIComponent(payeeName || 'Jojo Production');
    let upiString = `upi://pay?pa=${cleanUpi}&pn=${cleanName}&cu=${currency}`;
    if (amount > 0) {
        upiString += `&am=${amount.toFixed(2)}`;
    }
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiString)}`;
    return qrApiUrl;
};

module.exports = {
    generateUpiQrUrl
};
