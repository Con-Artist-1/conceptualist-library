import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const searchAppDir = path.resolve(__dirname, '..');

console.log('Starting Vite build in:', searchAppDir);
try {
  await build({
    root: searchAppDir,
    configFile: path.join(searchAppDir, 'vite.config.js')
  });
  console.log('Vite build finished successfully!');

  // Run SEO pre-rendering & sitemap generation
  console.log('Running static SEO pre-rendering & sitemap generation...');
  await import('./prerender-seo.js');
  console.log('SEO pre-rendering complete!');
} catch (err) {
  console.error('Vite build failed:', err);
  process.exit(1);
}

