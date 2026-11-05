import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("prisma/schema.prisma")) {
  process.exit(0);
}

const result = spawnSync("prisma", ["generate"], { stdio: "inherit" });
process.exit(result.status ?? 1);
