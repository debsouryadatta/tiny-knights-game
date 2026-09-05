import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://huggingface.co/Cactus-Compute/needle2/resolve/main/needle2.cact';
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'needle2.cact');

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`Failed to download Needle 2 weights: ${response.status} ${response.statusText}`);
}
await mkdir(dirname(dest), { recursive: true });
const bytes = Buffer.from(await response.arrayBuffer());
await writeFile(dest, bytes);
console.log(`Wrote ${dest} (${bytes.length} bytes)`);
