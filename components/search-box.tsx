import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBox({ placeholder, defaultValue }: { placeholder: string; defaultValue?: string }) {
  return (
    <form className="relative mb-4 max-w-md" action="">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input name="q" defaultValue={defaultValue ?? ""} placeholder={placeholder} className="h-10 bg-card pl-9" />
    </form>
  );
}
