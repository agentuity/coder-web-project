import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

function getKey(): Buffer {
	const secret = process.env.AGENTUITY_AUTH_SECRET;
	if (!secret) throw new Error('AGENTUITY_AUTH_SECRET is required');
	return createHash('sha256').update(secret).digest();
}

export function encrypt(plaintext: string): string {
	const key = getKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
	const key = getKey();
	const [ivHex, encHex, tagHex] = ciphertext.split(':');
	if (!ivHex || !encHex || !tagHex) throw new Error('Invalid ciphertext format');
	const iv = Buffer.from(ivHex, 'hex');
	const encrypted = Buffer.from(encHex, 'hex');
	const authTag = Buffer.from(tagHex, 'hex');
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
