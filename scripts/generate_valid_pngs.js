const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height) {
    // Generate valid uncompressed PNG buffer
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8; // Bit depth
    ihdrData[9] = 2; // Color type (RGB)
    ihdrData[10] = 0; // Compression method
    ihdrData[11] = 0; // Filter method
    ihdrData[12] = 0; // Interlace method
    
    const ihdrChunk = createChunk('IHDR', ihdrData);

    // IDAT chunk (raw RGB image data: indigo #4f46e5)
    const rowSize = 1 + width * 3;
    const rawData = Buffer.alloc(height * rowSize);
    for (let y = 0; y < height; y++) {
        const offset = y * rowSize;
        rawData[offset] = 0; // Filter type 0 (None)
        for (let x = 0; x < width; x++) {
            const pxOffset = offset + 1 + x * 3;
            rawData[pxOffset] = 0x4f;     // R
            rawData[pxOffset + 1] = 0x46; // G
            rawData[pxOffset + 2] = 0xe5; // B
        }
    }

    const compressed = zlib.deflateSync(rawData);
    const idatChunk = createChunk('IDAT', compressed);

    // IEND chunk
    const iendChunk = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function crc32(buf) {
    let table = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            if (c & 1) c = 0xedb88320 ^ (c >>> 1);
            else c = c >>> 1;
        }
        table[n] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

const iconsDir = path.join(__dirname, '../public/images/icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPng(192, 192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createPng(512, 512));

console.log('PNG PWA icons generated successfully: icon-192.png and icon-512.png');
