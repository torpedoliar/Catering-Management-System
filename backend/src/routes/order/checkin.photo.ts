import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function savePickupPhoto(buffer: Buffer | undefined, enabled: boolean, directory: string) {
    if (!buffer || !enabled) return { status: 'not_requested' as const };
    const name = `${randomUUID()}.webp`;
    const filepath = path.join(directory, name);
    const cleanup = () => unlink(filepath).catch(() => undefined);
    try {
        await mkdir(directory, { recursive: true });
        await sharp(buffer).rotate().resize(400, 400, { fit: 'cover' }).webp({ quality: 80 }).toFile(filepath);
        return { status: 'saved' as const, reference: `private:${name}`, cleanup };
    } catch (error) {
        console.error('Check-in photo failed:', error);
        await cleanup();
        return { status: 'failed' as const };
    }
}
