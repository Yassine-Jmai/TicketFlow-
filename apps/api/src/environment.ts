import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const environmentFile = resolve(__dirname, "../.env");

export function loadEnvironment() {
  if (!existsSync(environmentFile)) return;

  const contents = readFileSync(environmentFile, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const assignment = trimmedLine.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!assignment) continue;

    const [, name, rawValue] = assignment;
    if (process.env[name]?.trim()) continue;

    let value = rawValue.trim();
    const quote = value[0];

    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    process.env[name] = value;
  }
}

loadEnvironment();
