"use client";

import { useEffect, useState } from "react";
import { readCloudUser } from "@/browser/src/cloud";
import { moloniStatus } from "@/browser/src/moloni";

export function SimulationBanner() {
  const companyId = readCloudUser()?.companyId ?? "";
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!companyId) return;
    void moloniStatus(companyId).then((status) => setVisible(!status.connected));
  }, [companyId]);
  if (!visible) return null;
  return (
    <div className="-mx-2 -mt-2 mb-2 bg-[#fff6d4] px-3 py-1.5 text-[17px] leading-snug text-[#6b5a20]">
      Faturação simulada. Os documentos emitidos por «Faturar» não são certificados pela Autoridade Tributária e não têm validade fiscal.
    </div>
  );
}
