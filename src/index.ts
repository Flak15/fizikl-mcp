#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AUTH_FILE_PATH, getCredentials, loadEnvFile } from "./config.js";
import { FiziklAuth } from "./fizikl/auth.js";
import { getDaySummary } from "./tools/get-day-summary.js";
import { listMeals } from "./tools/list-meals.js";

loadEnvFile();

let credentials;
try {
  credentials = getCredentials();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const auth = new FiziklAuth({ credentials, authFilePath: AUTH_FILE_PATH });

const server = new McpServer({ name: "fizikl-mcp", version: "0.1.0" });

server.tool(
  "list_meals",
  "Приёмы пищи дневника Физикл с их slug (zavtrak/obed/uzhin/perekus). Slug нужен при записи съеденного.",
  {},
  async () => {
    try {
      return { content: [{ type: "text", text: await listMeals(auth) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      };
    }
  },
);

server.tool(
  "get_day_summary",
  "Итоги дня (калории, белки, жиры, углеводы, клетчатка, вес еды) и записи о съеденном за дату, сгруппированные по приёмам пищи. Без даты — сегодня.",
  {
    date: z
      .string()
      .optional()
      .describe("Дата в формате YYYY-MM-DD (например 2026-10-31); без параметра — сегодня"),
  },
  async ({ date }) => {
    try {
      return { content: [{ type: "text", text: await getDaySummary(auth, { date }) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      };
    }
  },
);

await server.connect(new StdioServerTransport());
console.error("fizikl-mcp: сервер запущен (stdio)");
