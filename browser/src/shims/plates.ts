import { lookupPlateRemote } from "@/browser/src/lookup-api";
import { cloudConfigured } from "@/browser/src/cloud";
import { lookupMockPlate } from "@/lib/plates/mock";
import type { PlateVehicle } from "@/lib/plates/types";

export async function lookupPlate(plate: string) {
  if (!cloudConfigured()) return lookupMockPlate(plate);
  const result = await lookupPlateRemote(plate);
  if (!result.found) {
    // Never show provider set-up details to the workshop: just say it was not found.
    const raw = String(result.message || "");
    const technical = /fornecedor|por definir|configur|provider|chave|api/i.test(raw);
    const message = technical || !raw
      ? "Matrícula não encontrada nas viaturas da oficina. Preenche os dados da viatura à mão."
      : raw;
    return { found: false, simulated: false, providerId: "a_definir", providerLabel: "A definir", vehicle: null, message };
  }
  const vehicle = result.vehicle as Partial<PlateVehicle>;
  return {
    found: true,
    simulated: false,
    providerId: "cache",
    providerLabel: result.cached ? "Já consultada" : "Consulta",
    vehicle: {
      plate: String(vehicle.plate || plate),
      brand: String(vehicle.brand || ""),
      model: String(vehicle.model || ""),
      version: String(vehicle.version || ""),
      year: /^\d{4}$/.test(String(vehicle.year ?? "")) ? Number(vehicle.year) : 0,
      fuel: String(vehicle.fuel || ""),
      engine: String(vehicle.engine || ""),
      vin: vehicle.vin ? String(vehicle.vin) : null,
    },
    message: result.cached ? "Esta matrícula já estava guardada. Não gastámos outro crédito." : "Dados da matrícula preenchidos.",
  };
}
