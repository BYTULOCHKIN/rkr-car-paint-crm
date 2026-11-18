import Providers from '@/components/layout/providers';
import { Toaster } from '@/components/ui/sonner';
import { fontVariables } from '@/components/themes/font.config';
import { DEFAULT_THEME, THEMES } from '@/components/themes/theme.config';
import ThemeProvider from '@/components/themes/theme-provider';
import { cn } from '@/lib/utils';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import NextTopLoader from 'nextjs-toploader';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import '../styles/globals.css';

const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b'
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://paintauto.pp.ua'),
  title: {
    default: 'PaintAuto — CRM для автомалярки',
    template: '%s | PaintAuto'
  },
  description:
    'Клієнти, автомобілі, замовлення, платежі та склад — керуйте роботою автомалярки в одній системі.',
  openGraph: {
    title: 'PaintAuto — CRM для автомалярки',
    description:
      'Клієнти, автомобілі, замовлення, платежі та склад — керуйте роботою автомалярки в одній системі.',
    siteName: 'PaintAuto',
    locale: 'uk_UA',
    type: 'website',
    images: [
      {
        url: '/paintauto-preview-v1.jpg',
        width: 1200,
        height: 630,
        alt: 'PaintAuto — огляд роботи автомалярки: замовлення, платежі та аналітика'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PaintAuto — CRM для автомалярки',
    description:
      'Клієнти, автомобілі, замовлення, платежі та склад — керуйте роботою автомалярки в одній системі.',
    images: ['/paintauto-preview-v1.jpg']
  }
};

export const viewport: Viewport = {
  themeColor: META_THEME_COLORS.light
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get('active_theme')?.value;
  const isValidTheme = THEMES.some((t) => t.value === activeThemeValue);
  const themeToApply = isValidTheme ? activeThemeValue! : DEFAULT_THEME;

  return (
    <html lang='uk' suppressHydrationWarning data-theme={themeToApply}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                // Set meta theme color
                if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '${META_THEME_COLORS.dark}')
                }
              } catch (_) {}
            `
          }}
        />
      </head>
      <body
        className={cn(
          'bg-background overflow-x-hidden overscroll-none font-sans antialiased',
          fontVariables
        )}
      >
        <NextTopLoader color='var(--primary)' showSpinner={false} />
        <NuqsAdapter>
          <ThemeProvider
            attribute='class'
            defaultTheme='system'
            enableSystem
            disableTransitionOnChange
            enableColorScheme
          >
            <Providers activeThemeValue={themeToApply}>
              <Toaster />
              {children}
            </Providers>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
