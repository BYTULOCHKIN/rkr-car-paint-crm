export function usePathname() {
  return location.pathname;
}
export function useSearchParams() {
  return new URLSearchParams(location.search);
}
export function useRouter() {
  return {
    push: (href: string) => location.assign(href),
    replace: (href: string) => location.replace(href),
    refresh: () => location.reload(),
    prefetch: async () => {},
    back: () => history.back()
  };
}
