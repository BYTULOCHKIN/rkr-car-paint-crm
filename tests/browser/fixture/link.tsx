import type { ComponentProps } from 'react';
export default function Link({ href, children, ...props }: ComponentProps<'a'>) {
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}
