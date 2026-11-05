"use server";

import { requireUser } from "@/lib/auth";
import { getPlateLookup } from "@/lib/plates";
import type { PlateLookupResult } from "@/lib/plates/types";

export async function lookupPlate(plate: string): Promise<PlateLookupResult | { found: false; simulated: true; message: string; providerLabel: string }> {
  await requireUser();
  try {
    return await getPlateLookup().lookup(plate);
  } catch (error) {
    return {
      found: false,
      simulated: true,
      providerLabel: "Consulta de matrícula",
      message: error instanceof Error ? error.message : "Não foi possível consultar a matrícula.",
    };
  }
}
