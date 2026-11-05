import { mockPlateLookup, paidPlateLookup } from "@/lib/plates/mock";
import type { PlateLookup } from "@/lib/plates/types";

export function getPlateLookup(): PlateLookup {
  const provider = process.env.PLATE_PROVIDER ?? "mock";
  if (provider === "mock" || provider === "mock-plate") return mockPlateLookup;
  if (provider === "matricula-api") return paidPlateLookup;
  throw new Error(
    `Fornecedor de matrículas desconhecido (${provider}). Use mock até ligar uma API paga portuguesa.`,
  );
}
