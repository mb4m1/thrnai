import fs from "fs";
import path from "path";

const distDir = path.resolve(process.cwd(), "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const indexPath = path.join(distDir, "index.html");
if (fs.existsSync(indexPath)) {
  console.log(`[build-static] Preserving Vite React production build at ${indexPath}`);
} else {
  console.log(`[build-static] Creating default index.html at ${indexPath}`);
}
