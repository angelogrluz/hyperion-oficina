import { lookupMockPlate } from "@/lib/plates/mock";

export async function lookupPlate(plate: string) {
  return lookupMockPlate(plate);
}
