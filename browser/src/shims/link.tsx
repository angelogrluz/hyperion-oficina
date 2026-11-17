import { Link as RouterLink } from "react-router-dom";
import type { ReactNode } from "react";
import { workshopPath } from "@/lib/workshop-slug";

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
  "data-testid"?: string;
}) {
  return (
    <RouterLink to={workshopPath(href)} {...props}>
      {children}
    </RouterLink>
  );
}
