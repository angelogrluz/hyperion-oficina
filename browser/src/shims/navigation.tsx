import { useLocation, useNavigate } from "react-router-dom";

export function usePathname() {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    refresh: () => window.location.reload(),
    back: () => navigate(-1),
  };
}

export function useSearchParams() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

export function redirect(url: string): never {
  window.location.assign(url);
  throw new Error("redirect");
}
