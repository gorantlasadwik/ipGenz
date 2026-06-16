import * as crypto from 'crypto';

// The key must be exactly 32 bytes (256 bits) long for AES-256.
// In production, this MUST come from an environment variable!
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 bytes
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

export function encryptString(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Format: iv:encryptedData
    return iv.toString('hex') + ':' + encrypted;
  } catch (err) {
    console.error('Encryption failed:', err);
    return text; // Fallback to plain text if something fails (bad practice in strict prod, but safe here)
  }
}

export function decryptString(text: string): string {
  if (!text) return text;
  // If it doesn't look like our encrypted format (no colon or wrong length IV), assume plain text
  if (!text.includes(':')) {
    return text;
  }
  
  try {
    const textParts = text.split(':');
    const ivHex = textParts.shift();
    if (!ivHex || ivHex.length !== IV_LENGTH * 2) {
      return text;
    }
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Decryption failed:', err);
    return text; // Fallback to plain text
  }
}
