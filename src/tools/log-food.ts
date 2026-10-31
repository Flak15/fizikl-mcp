/**
 * Дефолты ADR-0005: eaten_date → сегодня, meal → по локальному времени машины.
 * Чистые функции от явно переданного «сейчас» — тесты фиксируют время без fake timers.
 */

import { FIZIKL_URLS } from "../config.js";
import type { FiziklAuth } from "../fizikl/auth.js";
import { getJson, sendJson } from "../fizikl/client.js";

/** Окна [04:00,12:00) zavtrak, [12:00,18:00) obed, [18:00,21:00) uzhin, [21:00,04:00) perekus. */
export function pickMeal(now: Date): string {
  const hours = now.getHours();
  if (hours >= 4 && hours < 12) return "zavtrak";
  if (hours >= 12 && hours < 18) return "obed";
  if (hours >= 18 && hours < 21) return "uzhin";
  return "perekus";
}

/** Локальная календарная дата YYYY-MM-DD без времени. */
export function today(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

interface Meal {
  id: number;
  name: string;
  slug: string;
  is_enable: boolean;
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

/** Запись съеденного: массив из одного элемента в eaten-food/create-list (ADR-0004, задел на будущее). */
export async function logFood(
  auth: FiziklAuth,
  args: LogFoodArgs,
  now: Date = new Date(),
): Promise<string> {
  // Валидация до любых запросов: дневник остаётся нетронутым.
  if (!(args.servingAmount >= 0.01)) {
    throw new Error(
      `serving_amount должен быть не меньше 0.01 (получено: ${args.servingAmount}) — ничего не записано.`,
    );
  }

  const mealSlug = args.meal ?? pickMeal(now);
  const eatenDate = args.eatenDate ?? today(now);

  // Пре-валидация slug по живому списку приёмов (тот же вызов, что у list_meals):
  // неизвестный slug — русская ошибка до записи, дневник не трогаем.
  const meals = await getJson<Meal[]>(auth, `${FIZIKL_URLS.foodTracker}/api/v1/ration/meal/list/`);
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

  const record = created[0];
  const idPart = typeof record?.id === "number" ? ` (id записи: ${record.id})` : "";
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const mealLine = args.meal
    ? `Приём пищи: ${meal.name} (${meal.slug}) — задан явно.`
    : `Приём пищи: ${meal.name} (${meal.slug}) — подобран по времени (сейчас ${clock}).`;
  const dateLine = args.eatenDate
    ? `Дата: ${eatenDate} — задана явно.`
    : `Дата: сегодня, ${eatenDate}.`;
  return ["Записано в дневник питания:", `- запись${idPart}`, mealLine, dateLine].join("\n");
}
