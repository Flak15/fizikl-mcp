import os from "node:os";
import path from "node:path";

export const FIZIKL_URLS = {
  auth: "https://pht.space",
  foodTracker: "https://food-tracker.pht.space",
  search: "https://search.pht.space",
} as const;

export const AUTH_FILE_PATH = path.join(os.homedir(), ".fizikl-mcp", "auth.json");

export function getCredentials(): { login: string; password: string } {
  const login = process.env.LOGIN;
  const password = process.env.PASSWORD;
  if (!login || !password) {
    throw new Error(
      "Не заданы LOGIN и PASSWORD. Передайте их через env-блок в конфигурации вашего MCP-клиента (см. README).",
    );
  }
  return { login, password };
}
