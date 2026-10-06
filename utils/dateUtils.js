/**
 * Jojo ERP - India Standard Time (IST / Asia/Kolkata) Date & Time Utility
 * Ensures explicit Asia/Kolkata timezone conversion and formatting across Vercel, Render & local servers.
 */

const TIMEZONE_IST = 'Asia/Kolkata';

/**
 * Returns current Date object for instant comparisons.
 */
function getISTNow() {
    return new Date();
}

/**
 * Formats a Date / ISO string into IST Date string (e.g., "06 Oct 2026")
 */
function formatISTDate(date, options = {}) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';

    const defaultOpts = {
        timeZone: TIMEZONE_IST,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...options
    };
    return d.toLocaleDateString('en-IN', defaultOpts);
}

/**
 * Formats a Date / ISO string into IST Time string (e.g., "07:00 PM IST")
 */
function formatISTTime(date, options = {}) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';

    const defaultOpts = {
        timeZone: TIMEZONE_IST,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        ...options
    };
    return d.toLocaleTimeString('en-IN', defaultOpts);
}

/**
 * Formats a Date / ISO string into IST Date + Time string (e.g., "06 Oct 2026, 07:00 PM IST")
 */
function formatISTDateTime(date, options = {}) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';

    const defaultOpts = {
        timeZone: TIMEZONE_IST,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        ...options
    };
    return d.toLocaleString('en-IN', defaultOpts);
}

/**
 * Parses user input date string (YYYY-MM-DD) and optional time string (HH:mm) into a UTC Date object representing Asia/Kolkata.
 */
function parseISTDateTime(dateStr, timeStr = '00:00') {
    if (!dateStr) return null;

    let cleanDate = String(dateStr).trim();
    // If dateStr contains 'T', take date part
    if (cleanDate.includes('T')) {
        cleanDate = cleanDate.split('T')[0];
    }

    let cleanTime = String(timeStr || '00:00').trim();

    // Handle 12-hour format if passed (e.g., "07:00 PM")
    if (cleanTime.toUpperCase().includes('AM') || cleanTime.toUpperCase().includes('PM')) {
        const isPM = cleanTime.toUpperCase().includes('PM');
        const match = cleanTime.match(/(\d+):(\d+)/);
        if (match) {
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            if (isPM && h < 12) h += 12;
            if (!isPM && h === 12) h = 0;
            cleanTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
    }

    if (!cleanTime.includes(':')) {
        cleanTime = '00:00';
    }

    // Append seconds if missing
    if (cleanTime.split(':').length === 2) {
        cleanTime += ':00';
    }

    const isoStr = `${cleanDate}T${cleanTime}+05:30`;
    const parsed = new Date(isoStr);
    return isNaN(parsed.getTime()) ? new Date(dateStr) : parsed;
}

/**
 * Returns YYYY-MM-DD string in IST for HTML date input values
 */
function formatISTInputDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE_IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Returns HH:mm string in IST for HTML time input values
 */
function formatISTInputTime(date) {
    if (!date) return '19:00';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '19:00';
    return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE_IST, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

module.exports = {
    TIMEZONE_IST,
    getISTNow,
    formatISTDate,
    formatISTTime,
    formatISTDateTime,
    parseISTDateTime,
    formatISTInputDate,
    formatISTInputTime
};
