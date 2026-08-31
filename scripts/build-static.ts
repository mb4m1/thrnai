import fs from "fs";
import path from "path";
import { renderThrnDocument } from "../src/renderDocument.ts";

const distDir = path.resolve(process.cwd(), "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const html = renderThrnDocument();
const indexPath = path.join(distDir, "index.html");
fs.writeFileSync(indexPath, html, "utf-8");

console.log(`[build-static] Successfully wrote production HTML to ${indexPath} (${html.length} bytes)`);
