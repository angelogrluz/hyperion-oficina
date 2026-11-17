import { lookupPlateRemote } from "@/browser/src/lookup-api";
import { cloudConfigured } from "@/browser/src/cloud";
import { lookupMockPlate } from "@/lib/plates/mock";
import type { PlateVehicle } from "@/lib/plates/types";

export async function lookupPlate(plate: string) {
  if (!cloudConfigured()) return lookupMockPlate(plate);
  const result = await lookupPlateRemote(plate);
  if (!result.found) {
    return { found: false, simulated: false, providerId: "a_definir", providerLabel: "A definir", vehicle: null, message: result.message };
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
      year: Number(vehicle.year) || new Date().getFullYear(),
      fuel: String(vehicle.fuel || ""),
      engine: String(vehicle.engine || ""),
      vin: vehicle.vin ? String(vehicle.vin) : null,
    },
    message: result.cached ? "Esta matrícula já estava guardada. Não gastámos outro crédito." : "Dados da matrícula preenchidos.",
  };
}
