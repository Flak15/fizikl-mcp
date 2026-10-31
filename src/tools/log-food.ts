/**
 * Дефолты ADR-0005: eaten_date → сегодня, meal → по локальному времени машины.
 * Чистые функции от явно переданного «сейчас» — тесты фиксируют время без fake timers.
 */

import { FIZIKL_URLS } from "../config.js";
import type { FiziklAuth } from "../fizikl/auth.js";
import { sendJson } from "../fizikl/client.js";
import type { Meal } from "../fizikl/types.js";
import { today } from "./format.js";
import { fetchMeals } from "./list-meals.js";

/** Окна [04:00,12:00) zavtrak, [12:00,18:00) obed, [18:00,21:00) uzhin, [21:00,04:00) perekus. */
export function pickMeal(now: Date): string {
  const hours = now.getHours();
  if (hours >= 4 && hours < 12) return "zavtrak";
  if (hours >= 12 && hours < 18) return "obed";
  if (hours >= 18 && hours < 21) return "uzhin";
  return "perekus";
}

export interface LogFoodArgs {
  /** ID порции продукта (food_servings из get_food). */
  servingId: number;
  /** Количество порций (для порции «г» — просто граммы). */
  servingAmount: number;
  /** Slug приёма пищи из list_meals; не задан — подбирается по времени (ADR-0005). */
  meal?: string;
  /** Дата YYYY-MM-DD; не задана — сегодня по локальной таймзоне машины. */
  eatenDate?: string;
}

/**
 * Кэш meal/list на время жизни процесса: тёплый сервер не платит round-trip за каждую
 * запись. Компромисс (осознанный): приёмы пищи, созданные другим клиентом посреди
 * сессии, станут видны только после рестарта — для пре-валидации slug это приемлемо.
 * Неудачный запрос кэш не заполняет — следующая попытка снова сходит в сеть.
 */
let mealsCache: Meal[] | null = null;

/** Сброс кэша приёмов пищи (точка для тестов). */
export function resetMealsCache(): void {
  mealsCache = null;
}

async function fetchMealsCached(auth: FiziklAuth): Promise<Meal[]> {
  if (mealsCache === null) {
    mealsCache = await fetchMeals(auth);
  }
  return mealsCache;
}

/** Структурированный итог записи: id и применённые значения — для программных проверок (smoke), без разбора текста. */
export interface CreatedEatenFood {
  /** id созданной записи из ответа create-list; он же нужен delete_eaten_food. */
  id: number;
  /** Приём пищи, реально применённый при записи (явный или подобранный). */
  meal: Meal;
  /** Дата записи YYYY-MM-DD — явная или дефолтная «сегодня». */
  eatenDate: string;
}

/**
 * Валидация, подбор дефолтов (ADR-0005) и запись: POST eaten-food/create-list
 * (массив из одного элемента — ADR-0004, задел на будущее).
 */
export async function createEatenFood(
  auth: FiziklAuth,
  args: LogFoodArgs,
  now: Date = new Date(),
): Promise<CreatedEatenFood> {
  // Валидация до любых запросов: дневник остаётся нетронутым.
  if (!(args.servingAmount >= 0.01)) {
    throw new Error(
      `serving_amount должен быть не меньше 0.01 (получено: ${args.servingAmount}) — ничего не записано.`,
    );
  }

  const mealSlug = args.meal ?? pickMeal(now);
  const eatenDate = args.eatenDate ?? today(now);

  // Пре-валидация slug по списку приёмов (кэширован, тот же вызов, что у list_meals):
  // неизвестный slug — русская ошибка до записи, дневник не трогаем.
  const meals = await fetchMealsCached(auth);
  const meal = meals.find((candidate) => candidate.slug === mealSlug);
  if (!meal) {
    const known = meals.map((candidate) => candidate.slug).join(", ");
    throw new Error(
      `Приём пищи «${mealSlug}» не найден в дневнике — ничего не записано. Доступные slug: ${known}.`,
    );
  }

  const created = await sendJson<Array<{ id?: unknown }>>(
    auth,
    `${FIZIKL_URLS.foodTracker}/api/v1/ration/eaten-food/create-list/`,
    [
      {
        serving: args.servingId,
        serving_amount: args.servingAmount,
        meal: mealSlug,
        eaten_date: eatenDate,
      },
    ],
  );

  const id = created[0]?.id;
  if (typeof id !== "number") {
    // Без id запись не удалить (delete_eaten_food) — честная ошибка вместо записи-сироты.
    throw new Error("Физикл не вернул id созданной записи — не могу подтвердить запись.");
  }
  return { id, meal, eatenDate };
}

/** Человекочитаемый ответ log_food: id записи и применённые дефолты названы явно (ADR-0005). */
export function formatCreatedEatenFood(
  created: CreatedEatenFood,
  args: LogFoodArgs,
  now: Date,
): string {
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const mealLine = args.meal
    ? `Приём пищи: ${created.meal.name} (${created.meal.slug}) — задан явно.`
    : `Приём пищи: ${created.meal.name} (${created.meal.slug}) — подобран по времени (сейчас ${clock}).`;
  const dateLine = args.eatenDate
    ? `Дата: ${created.eatenDate} — задана явно.`
    : `Дата: сегодня, ${created.eatenDate}.`;
  return ["Записано в дневник питания:", `- запись (id записи: ${created.id})`, mealLine, dateLine].join("\n");
}

/** MCP-обёртка: структурная запись + текст ответа. */
export async function logFood(
  auth: FiziklAuth,
  args: LogFoodArgs,
  now: Date = new Date(),
): Promise<string> {
  const created = await createEatenFood(auth, args, now);
  return formatCreatedEatenFood(created, args, now);
}
