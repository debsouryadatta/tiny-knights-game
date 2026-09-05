// Bounded image requests prevent decorative sheets competing with playable art.
export async function loadAssets(entries, images, {onProgress, optional = false, stopped = () => false} = {}) {
  let cursor = 0, completed = 0, failed = false;
  const errors = [];
  onProgress?.({completed, total: entries.length});
  await Promise.all(Array.from({length: Math.min(6, entries.length)}, async () => {
    while (cursor < entries.length && !stopped() && !failed) {
      const [key, file] = entries[cursor++];
      try {
        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          const timer = setTimeout(() => finish(new Error('Artwork timed out: ' + file)), 20000);
          function finish(error) { clearTimeout(timer); img.onload = img.onerror = null; error ? reject(error) : resolve(img); }
          img.onload = () => finish();
          img.onerror = () => finish(new Error('Could not load artwork: ' + file));
          img.decoding = 'async';
          img.src = '/Tiny Swords (Free Pack)/' + file;
        });
        if (!stopped()) images[key] = image;
      } catch (error) { errors.push(error); if (!optional) { failed = true; throw error; } }
      completed++;
      if (!stopped() && !failed) onProgress?.({completed, total: entries.length});
    }
  }));
  return errors;
}
