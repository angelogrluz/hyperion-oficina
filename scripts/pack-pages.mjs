import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const dist = path.resolve("browser/dist");
const staging = path.resolve("browser/pages-pack");
const artifact = "/opt/cursor/artifacts/hyperion-oficina.zip";

writeFileSync(
  path.join(dist, ".nojekyll"),
  "",
);
writeFileSync(
  path.join(dist, "404.html"),
  `<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8" />
    <title>Hyperion Car Lab</title>
    <script>sessionStorage.redirect = location.href;</script>
    <meta http-equiv="refresh" content="0;URL='/hyperion-oficina/'" />
  </head>
  <body></body>
</html>
`,
);

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(dist, staging, { recursive: true });
mkdirSync("/opt/cursor/artifacts", { recursive: true });
execSync(`cd "${staging}" && rm -f "${artifact}" && zip -r "${artifact}" .`, { stdio: "inherit" });
console.log(artifact);
