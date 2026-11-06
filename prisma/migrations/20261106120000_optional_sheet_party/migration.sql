-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '',
    "year" INTEGER NOT NULL,
    "vin" TEXT NOT NULL DEFAULT '',
    "engine" TEXT NOT NULL DEFAULT '',
    "km" INTEGER NOT NULL DEFAULT 0,
    "fuel" TEXT NOT NULL,
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Vehicle" ("brand", "clientId", "createdAt", "engine", "fuel", "id", "km", "model", "plate", "updatedAt", "version", "vin", "year") SELECT "brand", "clientId", "createdAt", "engine", "fuel", "id", "km", "model", "plate", "updatedAt", "version", "vin", "year" FROM "Vehicle";
DROP TABLE "Vehicle";
ALTER TABLE "new_Vehicle" RENAME TO "Vehicle";
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");
CREATE INDEX "Vehicle_clientId_idx" ON "Vehicle"("clientId");
CREATE TABLE "new_RepairOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "clientId" TEXT,
    "vehicleId" TEXT,
    "dateIn" DATETIME NOT NULL,
    "dateOut" DATETIME,
    "km" INTEGER NOT NULL,
    "problem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "notes" TEXT NOT NULL DEFAULT '',
    "invoiceNumber" TEXT,
    "invoiceProvider" TEXT,
    "invoiceIssuedAt" DATETIME,
    "invoiceSimulated" BOOLEAN NOT NULL DEFAULT false,
    "quoteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepairOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RepairOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RepairOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RepairOrder" ("clientId", "createdAt", "dateIn", "dateOut", "id", "invoiceIssuedAt", "invoiceNumber", "invoiceProvider", "invoiceSimulated", "km", "notes", "number", "problem", "quoteId", "status", "updatedAt", "vehicleId") SELECT "clientId", "createdAt", "dateIn", "dateOut", "id", "invoiceIssuedAt", "invoiceNumber", "invoiceProvider", "invoiceSimulated", "km", "notes", "number", "problem", "quoteId", "status", "updatedAt", "vehicleId" FROM "RepairOrder";
DROP TABLE "RepairOrder";
ALTER TABLE "new_RepairOrder" RENAME TO "RepairOrder";
CREATE UNIQUE INDEX "RepairOrder_number_key" ON "RepairOrder"("number");
CREATE UNIQUE INDEX "RepairOrder_quoteId_key" ON "RepairOrder"("quoteId");
CREATE INDEX "RepairOrder_status_idx" ON "RepairOrder"("status");
CREATE INDEX "RepairOrder_dateIn_idx" ON "RepairOrder"("dateIn");
CREATE INDEX "RepairOrder_clientId_idx" ON "RepairOrder"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
