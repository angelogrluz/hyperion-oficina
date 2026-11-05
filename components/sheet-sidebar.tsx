"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const SheetSidebarContext = createContext<(node: ReactNode | null) => void>(() => {});

export function SheetSidebarProvider({ children }: { children: (sidebar: ReactNode | null) => ReactNode }) {
  const [sidebar, setSidebar] = useState<ReactNode | null>(null);
  return <SheetSidebarContext.Provider value={setSidebar}>{children(sidebar)}</SheetSidebarContext.Provider>;
}

export function useSetSheetSidebar() {
  return useContext(SheetSidebarContext);
}
