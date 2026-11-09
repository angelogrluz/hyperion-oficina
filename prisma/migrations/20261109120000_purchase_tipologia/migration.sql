PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PurchaseLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "articleId" TEXT,
    "tipologia" TEXT NOT NULL DEFAULT 'produto',
    "ref" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "vatRate" REAL NOT NULL,
    "margin" REAL NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "stockBefore" REAL NOT NULL,
    "costBefore" REAL NOT NULL,
    CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseLine_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseLine" ("articleId", "cost", "costBefore", "description", "id", "margin", "position", "purchaseId", "quantity", "ref", "stockBefore", "tipologia", "vatRate")
SELECT "articleId", "cost", "costBefore", "description", "id", "margin", "position", "purchaseId", "quantity", "ref", "stockBefore", 'produto', "vatRate" FROM "PurchaseLine";
DROP TABLE "PurchaseLine";
ALTER TABLE "new_PurchaseLine" RENAME TO "PurchaseLine";
CREATE INDEX "PurchaseLine_purchaseId_idx" ON "PurchaseLine"("purchaseId");
CREATE INDEX "PurchaseLine_articleId_idx" ON "PurchaseLine"("articleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
