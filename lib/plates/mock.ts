import { isValidPlate, normalizePlate } from "@/lib/domain";
import { FUELS } from "@/lib/labels";
import type { PlateLookup, PlateLookupResult, PlateVehicle } from "@/lib/plates/types";

const KNOWN: Record<string, Omit<PlateVehicle, "plate">> = {
  "AB-19-CK": {
    brand: "Peugeot",
    model: "208",
    version: "1.2 PureTech Active",
    year: 2020,
    fuel: "Gasolina",
    engine: "1.2 PureTech 75 kW",
    vin: "VF3CCHMZ6LS123456",
  },
  "CD-47-MH": {
    brand: "Volkswagen",
    model: "Golf",
    version: "1.6 TDI Confortline",
    year: 2018,
    fuel: "Gasóleo",
    engine: "1.6 TDI 85 kW",
    vin: "WVWZZZAUZJW123456",
  },
  "DH-22-RL": {
    brand: "Mercedes-Benz",
    model: "Classe A",
    version: "A 180 Progressive",
    year: 2022,
    fuel: "Gasolina",
    engine: "1.3 100 kW",
    vin: "WDD1760421J123456",
  },
  "EK-08-PT": {
    brand: "Renault",
    model: "Master",
    version: "L2H2 2.3 dCi",
    year: 2021,
    fuel: "Gasóleo",
    engine: "2.3 dCi 99 kW",
    vin: "VF1MA000X61234567",
  },
  "FN-63-VX": {
    brand: "BMW",
    model: "320d",
    version: "Advantage",
    year: 2016,
    fuel: "Gasóleo",
    engine: "2.0 d 140 kW",
    vin: "WBA8E5104G1234567",
  },
  "GT-15-QB": {
    brand: "Toyota",
    model: "Yaris",
    version: "Hybrid Comfort",
    year: 2023,
    fuel: "Híbrido",
    engine: "1.5 Hybrid 85 kW",
    vin: "SB1K93BE00E123456",
  },
};

const CATALOG: Array<Omit<PlateVehicle, "plate" | "year" | "vin">> = [
  { brand: "Renault", model: "Clio", version: "1.0 TCe Intens", fuel: "Gasolina", engine: "1.0 TCe 67 kW" },
  { brand: "Peugeot", model: "308", version: "1.5 BlueHDi Allure", fuel: "Gasóleo", engine: "1.5 BlueHDi 96 kW" },
  { brand: "Volkswagen", model: "Polo", version: "1.0 TSI Life", fuel: "Gasolina", engine: "1.0 TSI 70 kW" },
  { brand: "Seat", model: "Leon", version: "1.6 TDI Style", fuel: "Gasóleo", engine: "1.6 TDI 85 kW" },
  { brand: "Toyota", model: "Corolla", version: "1.8 Hybrid Comfort", fuel: "Híbrido", engine: "1.8 Hybrid 90 kW" },
  { brand: "Citroën", model: "C3", version: "1.2 PureTech Feel", fuel: "Gasolina", engine: "1.2 PureTech 61 kW" },
  { brand: "Ford", model: "Focus", version: "1.0 EcoBoost Titanium", fuel: "Gasolina", engine: "1.0 EcoBoost 92 kW" },
  { brand: "Opel", model: "Corsa", version: "1.2 Edition", fuel: "Gasolina", engine: "1.2 55 kW" },
  { brand: "Nissan", model: "Qashqai", version: "1.3 DIG-T N-Connecta", fuel: "Gasolina", engine: "1.3 DIG-T 103 kW" },
  { brand: "Fiat", model: "500", version: "1.0 Hybrid Lounge", fuel: "Híbrido", engine: "1.0 Hybrid 51 kW" },
  { brand: "Dacia", model: "Sandero", version: "1.0 TCe Comfort", fuel: "GPL", engine: "1.0 TCe 67 kW" },
  { brand: "Hyundai", model: "Tucson", version: "1.6 CRDi Premium", fuel: "Gasóleo", engine: "1.6 CRDi 100 kW" },
];

const VIN_ALPHABET = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";

function hashPlate(plate: string) {
  let hash = 2166136261;
  for (const char of plate) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function vinFrom(hash: number) {
  let value = hash;
  let vin = "";
  for (let index = 0; index < 17; index += 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    vin += VIN_ALPHABET[value % VIN_ALPHABET.length];
  }
  return vin;
}

function plausible(plate: string): PlateVehicle {
  const hash = hashPlate(plate);
  const sample = CATALOG[hash % CATALOG.length];
  const year = 2008 + (hash % 18);
  const fuel = FUELS.includes(sample.fuel as (typeof FUELS)[number]) ? sample.fuel : "Gasolina";
  return {
    plate,
    brand: sample.brand,
    model: sample.model,
    version: sample.version,
    year,
    fuel,
    engine: sample.engine,
    vin: hash % 4 === 0 ? null : vinFrom(hash),
  };
}

export function lookupMockPlate(input: string): PlateLookupResult {
  const plate = normalizePlate(input);
  if (!isValidPlate(plate)) {
    return {
      found: false,
      simulated: true,
      providerId: "mock-plate",
      providerLabel: "Consulta de matrícula (simulação)",
      vehicle: null,
      message: "A matrícula tem de estar no formato AA-00-AA.",
    };
  }
  const known = KNOWN[plate];
  const vehicle = known ? { plate, ...known } : plausible(plate);
  return {
    found: true,
    simulated: true,
    providerId: "mock-plate",
    providerLabel: "Consulta de matrícula (simulação)",
    vehicle,
    message: known
      ? "Dados de demonstração para esta matrícula. Consulta simulada, sem serviço pago."
      : "Dados plausíveis gerados para esta matrícula. Consulta simulada, sem serviço pago.",
  };
}

export const mockPlateLookup: PlateLookup = {
  id: "mock-plate",
  label: "Consulta de matrícula (simulação)",
  simulated: true,
  async lookup(plate: string) {
    if (process.env.NODE_ENV !== "test") {
      await new Promise((resolve) => setTimeout(resolve, 280));
    }
    return lookupMockPlate(plate);
  },
};

export const paidPlateLookup: PlateLookup = {
  id: "matricula-api",
  label: "API paga de matrículas",
  simulated: false,
  async lookup(): Promise<PlateLookupResult> {
    const missing = ["PLATE_API_URL", "PLATE_API_KEY"].filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `A consulta paga de matrículas não está configurada (${missing.join(", ")}). A oficina continua em simulação.`,
      );
    }
    throw new Error("O adaptador da API paga está preparado, mas ainda não consulta um fornecedor. Use a simulação.");
  },
};
