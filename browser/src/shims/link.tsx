import { Link as RouterLink } from "react-router-dom";
import type { ReactNode } from "react";

export default function Link({
  href,
  children,
  ...props
}: {
  href: string;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  );
}
