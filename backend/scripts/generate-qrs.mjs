/*
Usage:
  node scripts/generate-qrs.mjs ./room-codes.txt

room-codes.txt:
CODE_1
CODE_2
...
*/
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const [, , sourceFile = "room-codes.txt"] = process.argv;
const sourcePath = path.resolve(sourceFile);
const outputDir = path.resolve("qrcodes");

const raw = await fs.readFile(sourcePath, "utf8");
const codes = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (codes.length === 0) {
  console.error("No room codes found in input file.");
  process.exit(1);
}

await fs.mkdir(outputDir, { recursive: true });

for (const code of codes) {
  await QRCode.toFile(path.join(outputDir, `${code}.png`), code, {
    margin: 1,
    width: 512
  });
}

console.log(`Generated ${codes.length} QR files in ${outputDir}`);
