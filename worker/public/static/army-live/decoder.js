'use strict';
// Separate statistics decoder. It never imports the site's identity QR code.
importScripts('../qr-vendor/jsqr-1.4.0.js');
self.onmessage = function (event) {
  const message = event.data;
  let pixels = null;
  try {
    if (!message || message.type !== 'decode' || !Number.isSafeInteger(message.id) || !Number.isSafeInteger(message.generation) || !Number.isInteger(message.width) || !Number.isInteger(message.height) || message.width < 1 || message.height < 1 || message.width > 1280 || message.height > 1280 || message.width * message.height > 1280 * 1280 || !(message.buffer instanceof ArrayBuffer) || message.buffer.byteLength !== message.width * message.height * 4) throw new Error('Invalid bounded image.');
    pixels = new Uint8ClampedArray(message.buffer);
    const result = jsQR(pixels, message.width, message.height, { inversionAttempts: 'attemptBoth' });
    const text = result && typeof result.data === 'string' && result.data.startsWith('OLCS2|') ? result.data : null;
    if (text && text.length > 191) throw new Error('Oversized pilot frame.');
    self.postMessage({ type: 'decoded', id: message.id, generation: message.generation, text });
  } catch (_) {
    self.postMessage({ type: 'error', id: message && message.id, generation: message && message.generation, message: 'The local image decoder refused this input.' });
  } finally {
    if (pixels) pixels.fill(0);
    else if (message && message.buffer instanceof ArrayBuffer) new Uint8Array(message.buffer).fill(0);
  }
};
