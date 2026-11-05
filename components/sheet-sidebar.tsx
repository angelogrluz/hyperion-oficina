"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const SheetSidebarContext = createContext<(node: ReactNode | null) => void>(() => {});
const SheetHeaderContext = createContext<(node: ReactNode | null) => void>(() => {});

export function SheetSidebarProvider({ children }: { children: (sidebar: ReactNode | null, header: ReactNode | null) => ReactNode }) {
  const [sidebar, setSidebar] = useState<ReactNode | null>(null);
  const [header, setHeader] = useState<ReactNode | null>(null);
  return (
    <SheetSidebarContext.Provider value={setSidebar}>
      <SheetHeaderContext.Provider value={setHeader}>{children(sidebar, header)}</SheetHeaderContext.Provider>
    </SheetSidebarContext.Provider>
  );
}

export function useSetSheetSidebar() {
  return useContext(SheetSidebarContext);
}

export function useSetSheetHeader() {
  return useContext(SheetHeaderContext);
}
