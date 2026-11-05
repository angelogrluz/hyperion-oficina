export type PlateVehicle = {
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  fuel: string;
  engine: string;
  vin: string | null;
};

export type PlateLookupResult = {
  found: boolean;
  simulated: boolean;
  providerId: string;
  providerLabel: string;
  vehicle: PlateVehicle | null;
  message: string;
};

export interface PlateLookup {
  id: string;
  label: string;
  simulated: boolean;
  lookup(plate: string): Promise<PlateLookupResult>;
}
