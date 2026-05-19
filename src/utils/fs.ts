import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function readFileIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

export async function writeFile(p: string, content: string): Promise<{ bytes: number; hash: string }> {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, content, 'utf8');
  return {
    bytes: Buffer.byteLength(content, 'utf8'),
    hash: hashString(content),
  };
}

export function hashString(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

export async function hashFile(p: string): Promise<string | null> {
  const content = await readFileIfExists(p);
  if (content === null) return null;
  return hashString(content);
}
