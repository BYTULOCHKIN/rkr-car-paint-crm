import type { ComponentProps } from 'react';
// Vite test fixture has no Next image optimizer; production still uses next/image.
export default function Image({ alt = '', ...props }: ComponentProps<'img'>) {
  // oxlint-disable-next-line next/no-img-element
  return <img {...props} alt={alt} />;
}
