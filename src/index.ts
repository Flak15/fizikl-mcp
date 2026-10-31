#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AUTH_FILE_PATH, getCredentials, loadEnvFile } from "./config.js";
import { FiziklAuth } from "./fizikl/auth.js";
import { deleteEatenFood } from "./tools/delete-eaten-food.js";
import { getDaySummary } from "./tools/get-day-summary.js";
import { logFood } from "./tools/log-food.js";
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
  "log_food",
  "Записать съеденное в дневник Физикла: serving_id порции и serving_amount (порция «г» — это просто граммы). Без meal приём пищи подбирается по времени (4–12 завтрак, 12–18 обед, 18–21 ужин, 21–4 перекус), без eaten_date — сегодня; применённые значения видны в ответе.",
  {
    serving_id: z.number().int().describe("ID порции продукта (food_servings из get_food)"),
    serving_amount: z
      .number()
      .describe("Количество порций; для порции «г» — граммы (например, 200 = 200 г). Минимум 0.01"),
    meal: z
      .string()
      .optional()
      .describe("Slug приёма пищи из list_meals; если не задан — подберётся по текущему времени"),
    eaten_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "eaten_date должен быть в формате YYYY-MM-DD")
      .optional()
      .describe("Дата съеденного YYYY-MM-DD; если не задана — сегодня"),
  },
  async ({ serving_id, serving_amount, meal, eaten_date }) => {
    try {
      return {
        content: [{ type: "text", text: await logFood(auth, { servingId: serving_id, servingAmount: serving_amount, meal, eatenDate: eaten_date }) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      };
    }
  },
);

server.tool(
  "delete_eaten_food",
  "Удалить запись о съеденном из дневника Физикла по её id (виден в ответе log_food).",
  {
    id: z.number().int().describe("ID записи о съеденном"),
  },
  async ({ id }) => {
    try {
      return { content: [{ type: "text", text: await deleteEatenFood(auth, id) }] };
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
