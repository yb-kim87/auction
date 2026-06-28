import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(root, ".next"),
  path.join(root, "..", "..", "..", "..", "auction-next-cache"),
];

for (const dir of targets) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removed: ${dir}`);
  } catch (err) {
    console.warn(`skip: ${dir} (${err.code ?? err.message})`);
  }
}
