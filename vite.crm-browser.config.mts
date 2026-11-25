import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { filterStockItems } from './src/features/inventory/lib/search';
import { inventoryFiltersSchema } from './src/features/inventory/schemas/filters';
import type { StockItem, StockMovement } from './src/features/inventory/api/types';
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
  publicDir: `${root}/public`,
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
          if (req.url?.startsWith('/api/inventory/items?')) {
            const params = new URL(req.url, 'http://localhost').searchParams;
            const snapshot = req.headers.cookie
              ?.split('; ')
              .find((cookie) => cookie.startsWith('stock-items-fixture='))
              ?.slice('stock-items-fixture='.length);
            const filters = inventoryFiltersSchema.parse({
              search: params.get('search') ?? '',
              tags: params.getAll('tag'),
              archived: params.get('archived') === 'true',
              page: params.get('page') ?? undefined,
              pageSize: params.get('pageSize') ?? undefined
            });
            const items: StockItem[] = snapshot ? JSON.parse(decodeURIComponent(snapshot)) : [];
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            const matching = filterStockItems(
              items,
              filters.search,
              filters.tags,
              filters.archived
            );
            res.end(
              JSON.stringify({
                items: matching.slice(
                  (filters.page - 1) * filters.pageSize,
                  filters.page * filters.pageSize
                ),
                total: matching.length,
                page: filters.page,
                pageSize: filters.pageSize
              })
            );
            return;
          }
          if (req.url?.startsWith('/api/inventory/movements?')) {
            const params = new URL(req.url, 'http://localhost').searchParams;
            const snapshot = req.headers.cookie
              ?.split('; ')
              .find((value) => value.startsWith('stock-movements-fixture='))
              ?.slice('stock-movements-fixture='.length);
            const all: StockMovement[] = snapshot ? JSON.parse(decodeURIComponent(snapshot)) : [];
            const items = all.filter(
              (entry) =>
                (!params.get('itemId') || entry.itemId === params.get('itemId')) &&
                (!params.get('orderId') || entry.orderId === params.get('orderId'))
            );
            const page = Number(params.get('page') ?? 1),
              pageSize = Number(params.get('pageSize') ?? 50);
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                items: items.slice((page - 1) * pageSize, page * pageSize),
                total: items.length,
                page,
                pageSize
              })
            );
            return;
          }
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
          source.endsWith('/api/read-service') ||
          (source === './read-service' && importer?.includes('/features/crm/api/queries'))
        )
          return `${root}/tests/browser/fixture/read-service.ts`;
        if (source === './service' && importer?.includes('/features/overview/api/queries'))
          return `${root}/tests/browser/fixture/overview-service.ts`;

        if (source === './service' && importer?.includes('/features/order-labor/api/queries')) return `${root}/tests/browser/fixture/labor-service.ts`;
        if (
          importer?.replaceAll('\\', '/').includes('/features/order-expenses/api/queries') &&
          source === './service'
        )
          return `${root}/tests/browser/fixture/expense-service.ts`;
        if (
          importer?.replaceAll('\\', '/').includes('/features/payroll/api/queries') &&
          source === './service'
        )
          return `${root}/tests/browser/fixture/payroll-service.ts`;
        if (
          importer?.replaceAll('\\', '/').includes('/features/workshop-reports/api/queries') &&
          source === './service'
        )
          return `${root}/tests/browser/fixture/report-service.ts`;
        if (
          source === '@clerk/nextjs' &&
          ['/components/layout/app-sidebar', '/components/org-switcher', '/hooks/use-nav'].some(
            (part) => importer?.replaceAll('\\', '/').includes(part)
          )
        )
          return `${root}/tests/browser/fixture/clerk-sidebar.ts`;
        if (
          importer
            ?.replaceAll('\\', '/')
            .includes('/features/order-economics/api/finance-queries') &&
          source === './finance-service'
        )
          return `${root}/tests/browser/fixture/finance-service.ts`;
        if (
          importer?.replaceAll('\\', '/').includes('/features/order-economics/api/queries') &&
          source === './service'
        )
          return `${root}/tests/browser/fixture/service.ts`;
        if (
          importer?.replaceAll('\\', '/').includes('/features/inventory/api/queries') &&
          source === './service'
        )
          return `${root}/tests/browser/fixture/inventory-service.ts`;
        if (
          source === '@clerk/nextjs' &&
          importer?.replaceAll('\\', '/').includes('/features/crm/components/team-view')
        )
          return `${root}/tests/browser/fixture/clerk-team.tsx`;
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
