#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AUTH_FILE_PATH, getCredentials, loadEnvFile } from "./config.js";
import { FiziklAuth } from "./fizikl/auth.js";
import { getFood } from "./tools/get-food.js";
import { listMeals } from "./tools/list-meals.js";
import { searchFood } from "./tools/search-food.js";

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
  "search_food",
  "Поиск продуктов в базе Физикла по русскому названию («гречка», «творог 5%»). Сразу возвращает карточки топ-N результатов (лимит ≤ 10, по умолчанию 10) с порциями; порция «г» — способ записать «просто граммы».",
  {
    query: z.string().describe("Название продукта по-русски, например «гречка»"),
    limit: z.number().optional().describe("Сколько карточек вернуть: целое число 1–10, по умолчанию 10"),
  },
  async ({ query, limit }) => {
    try {
      return { content: [{ type: "text", text: await searchFood(auth, query, limit) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      };
    }
  },
);

server.tool(
  "get_food",
  "Карточка продукта Физикла по id (берётся из search_food): порции с id и metric_weight, КБЖУ порций, коэффициент варки. Порция «г» (metric_weight: 1) — способ записать «просто граммы»: serving_amount = вес в граммах.",
  {
    id: z.union([z.string(), z.number()]).describe("id продукта из search_food"),
  },
  async ({ id }) => {
    try {
      return { content: [{ type: "text", text: await getFood(auth, id) }] };
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
