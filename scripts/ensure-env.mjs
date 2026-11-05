import fs from "node:fs";

fs.mkdirSync("data", { recursive: true });

if (!fs.existsSync(".env")) {
  fs.writeFileSync(
    ".env",
    'DATABASE_URL="file:../data/hyperion.db"\nAUTH_SECRET="hyperion-car-lab-demo-secret-key-32b"\nINVOICE_PROVIDER="mock-moloni"\n',
  );
}
