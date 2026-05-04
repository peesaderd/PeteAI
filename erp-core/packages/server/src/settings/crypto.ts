import crypto from 'crypto';

// AES-256-GCM encrypt/decrypt utility for LLM provider API keys

function getEncryptionKey(): Buffer {
  const raw = process.env.LLM_PROVIDERS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('LLM_PROVIDERS_ENCRYPTION_KEY environment variable is required');
  }
  const encoded = Buffer.from(raw, 'utf-8');
  if (encoded.length < 32) {
    throw new Error('LLM_PROVIDERS_ENCRYPTION_KEY must be at least 32 characters long');
  }
  return encoded.subarray(0, 32);
}

export function encryptApiKey(plainText: string): { iv: string; data: string; tag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()]);
  return {
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

export function decryptApiKey(encrypted: { iv: string; data: string; tag: string }): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted.data, 'hex')), decipher.final()]);
  return decrypted.toString('utf-8');
}

export function encryptApiKeyForDB(plainText: string): string {
  const { iv, data, tag } = encryptApiKey(plainText);
  return `${iv}.${data}.${tag}`;
}

export function decryptApiKeyFromDB(encrypted: string): string {
  const parts = encrypted.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  return decryptApiKey({ iv: parts[0], data: parts[1], tag: parts[2] });
}
