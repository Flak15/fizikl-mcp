import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIZIKL_URLS = {
  auth: "https://pht.space",
  foodTracker: "https://food-tracker.pht.space",
  search: "https://search.pht.space",
} as const;

export const AUTH_FILE_PATH = path.join(os.homedir(), ".fizikl-mcp", "auth.json");

/** Корень проекта: src/… и dist/… лежат на одном уровне ниже него. */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Мини-загрузчик .env (KEY=VALUE) без внешних зависимостей: у корня проекта, затем в cwd. */
export function loadEnvFile(): void {
  for (const file of [path.join(PROJECT_ROOT, ".env"), path.join(process.cwd(), ".env")]) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      for (const line of raw.split("\n")) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const [, key, value] = match;
        if (!(key in process.env)) process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    } catch {
      // Нет файла — пробуем следующий путь
    }
  }
}

export function getCredentials(): { login: string; password: string } {
  const login = process.env.LOGIN;
  const password = process.env.PASSWORD;
  if (!login || !password) {
    throw new Error("Не заданы LOGIN и PASSWORD. Укажите их в .env у корня проекта (см. README).");
  }
  return { login, password };
}
