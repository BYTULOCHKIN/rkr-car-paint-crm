import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
function productionCss(): string {
  const folder = `${root}/.next/static/chunks`;
  return readdirSync(folder)
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(`${folder}/${name}`, 'utf8'))
    .join('\n');
}
export default defineConfig({
  root: `${root}/tests/browser/fixture`,
  resolve: {
    alias: {
      '@': `${root}/src`,
      'next/link': `${root}/tests/browser/fixture/link.tsx`,
      'next/navigation': `${root}/tests/browser/fixture/navigation.ts`,
      'next/image': `${root}/tests/browser/fixture/image.tsx`
    }
  },
  plugins: [
    {
      name: 'crm-test-services',
      enforce: 'pre',
      transformIndexHtml(html) {
        const fontClasses = [
          ...productionCss().matchAll(/\.([a-zA-Z0-9_-]+)\{--font-(?:sans|mono):/g)
        ]
          .map((match) => match[1])
          .join(' ');
        return html.replace('%CRM_FONT_CLASSES%', fontClasses);
      },
      configureServer(server) {
        // Use the actual Next.js production stylesheet rather than a second Tailwind build.
        server.middlewares.use((req, res, next) => {
          const font = req.url?.match(/^\/media\/([a-zA-Z0-9_.-]+\.woff2?)$/)?.[1];
          if (font) {
            res.setHeader('Content-Type', 'font/woff2');
            res.end(readFileSync(`${root}/.next/static/media/${font}`));
            return;
          }
          if (req.url !== '/crm-styles.css') return next();
          res.setHeader('Content-Type', 'text/css');
          res.end(productionCss());
        });
      },
      resolveId(source, importer) {
        if (
          importer?.replaceAll('\\', '/').includes('/features/crm/api/queries') &&
          source === './service'
        )
          return `${root}/tests/browser/fixture/service.ts`;
      }
    }
  ],
  server: { host: '127.0.0.1', port: 4173, strictPort: true, fs: { allow: [root] } }
});
