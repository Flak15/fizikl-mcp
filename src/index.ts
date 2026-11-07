#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ShapeOutput } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AUTH_FILE_PATH, getCredentials } from "./config.js";
import { FiziklAuth } from "./fizikl/auth.js";
import { deleteEatenFood } from "./tools/delete-eaten-food.js";
import { DATE_PATTERN } from "./tools/format.js";
import { getDaySummary } from "./tools/get-day-summary.js";
import { getFood } from "./tools/get-food.js";
import { listMeals } from "./tools/list-meals.js";
import { logFood } from "./tools/log-food.js";
import { searchFood } from "./tools/search-food.js";

let credentials;
try {
  credentials = getCredentials();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const auth = new FiziklAuth({ credentials, authFilePath: AUTH_FILE_PATH });

const server = new McpServer({ name: "fizikl-mcp", version: "0.1.0" });

/**
 * Единая регистрация инструмента: try/catch c {isError: true} живёт здесь один раз,
 * а не в каждом хендлере. Хендлеры возвращают только русский текст ответа.
 */
function registerTool<Args extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: Args,
  handler: (args: ShapeOutput<Args>) => Promise<string>,
): void {
  // Колбэк типизирован конкретно и передаётся с явным тип-аргументом: вывод SDK
  // сквозь обобщённую обёртку (условный ToolCallback<Args>) не разрешается —
  // а поведение регистрации при этом байт-в-байт как у прямого server.tool.
  const callback = async (rawArgs: { [key: string]: unknown }): Promise<CallToolResult> => {
    const args = rawArgs as ShapeOutput<Args>;
    try {
      return { content: [{ type: "text", text: await handler(args) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      };
    }
  };
  server.tool<z.ZodRawShape>(name, description, schema, callback);
}

registerTool(
  "list_meals",
  "Приёмы пищи дневника Физикл с их slug (zavtrak/obed/uzhin/perekus). Slug нужен при записи съеденного.",
  {},
  () => listMeals(auth),
);

registerTool(
  "search_food",
  "Поиск продуктов в базе Физикла по русскому названию («гречка», «творог 5%»). Сразу возвращает карточки топ-N результатов (лимит ≤ 10, по умолчанию 10) с порциями; порция «г» — способ записать «просто граммы».",
  {
    query: z.string().describe("Название продукта по-русски, например «гречка»"),
    limit: z.number().optional().describe("Сколько карточек вернуть: целое число 1–10, по умолчанию 10"),
  },
  async ({ query, limit }) => searchFood(auth, query, limit),
);

registerTool(
  "get_food",
  "Карточка продукта Физикла по id (берётся из search_food): порции с id и metric_weight, КБЖУ порций, коэффициент варки. Порция «г» (metric_weight: 1) — способ записать «просто граммы»: serving_amount = вес в граммах.",
  {
    id: z.union([z.string(), z.number()]).describe("id продукта из search_food"),
  },
  async ({ id }) => getFood(auth, id),
);

registerTool(
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
      .regex(DATE_PATTERN, "eaten_date должен быть в формате YYYY-MM-DD")
      .optional()
      .describe("Дата съеденного YYYY-MM-DD; если не задана — сегодня"),
  },
  async ({ serving_id, serving_amount, meal, eaten_date }) =>
    logFood(auth, { servingId: serving_id, servingAmount: serving_amount, meal, eatenDate: eaten_date }),
);

registerTool(
  "delete_eaten_food",
  "Удалить запись о съеденном из дневника Физикла по её id (виден в ответе log_food).",
  {
    id: z.number().int().describe("ID записи о съеденном"),
  },
  async ({ id }) => deleteEatenFood(auth, id),
);

registerTool(
  "get_day_summary",
  "Итоги дня (калории, белки, жиры, углеводы, клетчатка, вес еды) и записи о съеденном за дату, сгруппированные по приёмам пищи. Без даты — сегодня.",
  {
    date: z
      .string()
      .optional()
      .describe("Дата в формате YYYY-MM-DD (например 2026-10-31); без параметра — сегодня"),
  },
  async ({ date }) => getDaySummary(auth, { date }),
);

await server.connect(new StdioServerTransport());
console.error("fizikl-mcp: сервер запущен (stdio)");
