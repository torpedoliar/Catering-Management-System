import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { savePickupPhoto } from './checkin.photo';

it('does not write evidence when disabled or when the image cannot be decoded', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'checkin-photo-'));
    try {
        expect((await savePickupPhoto(Buffer.from('not an image'), false, dir)).status).toBe('not_requested');
        expect((await savePickupPhoto(Buffer.from('not an image'), true, dir)).status).toBe('failed');
        expect(await readdir(dir)).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

it('stores a resized private file and removes uncommitted evidence on cleanup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'checkin-photo-'));
    try {
        const buffer = await sharp({ create: { width: 5, height: 5, channels: 3, background: 'red' } }).png().toBuffer();
        const result = await savePickupPhoto(buffer, true, dir);
        expect(result.status).toBe('saved');
        if (result.status !== 'saved') throw new Error('Photo did not save');
        const [filename] = await readdir(dir);
        expect(result.reference).toBe(`private:${filename}`);
        expect(await sharp(await readFile(join(dir, filename))).metadata()).toMatchObject({ width: 400, height: 400, format: 'webp' });
        await result.cleanup();
        expect(await readdir(dir)).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
});
