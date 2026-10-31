import { FIZIKL_URLS } from "../config.js";
import type { FiziklAuth } from "../fizikl/auth.js";
import { getJson } from "../fizikl/client.js";

/** Запись календаря дневных отчётов (итог дня); значения — на съеденное за eaten_date. */
interface DayReport {
  eaten_date: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  fiber?: number;
  food_weight?: number;
}

/** Запись о съеденном (eaten-food): строка дневника с вложенными продуктом и порцией. */
interface EatenFoodItem {
  id: number;
  meal: string;
  serving_amount: number;
  food?: { name?: string } | null;
  serving?: { name?: string; metric_weight?: number } | null;
}

export interface GetDaySummaryOptions {
  /** Дата YYYY-MM-DD; без неё — сегодня по локальной таймзоне машины. */
  date?: string;
  /** Точка «сейчас» для дефолта даты (инъекция для тестов). */
  now?: Date;
}

/** Порядок приёмов пищи для вывода; свои приёмы (не из списка) — после стандартных. */
const MEAL_ORDER = ["zavtrak", "obed", "uzhin", "perekus"];

const MEAL_NAMES: Record<string, string> = {
  zavtrak: "завтрак",
  obed: "обед",
  uzhin: "ужин",
  perekus: "перекус",
};

/** Сегодняшняя дата в формате YYYY-MM-DD по локальной таймзоне (ADR-0005). */
function todayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Валидация YYYY-MM-DD до любых запросов: формат и существование такого календарного дня. */
function validateDate(date: string): void {
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`Неверный формат даты: «${date}». Нужен YYYY-MM-DD, например 2026-10-31.`);
  }
  const [year, month, day] = date.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  const realDay =
    asUtc.getUTCFullYear() === year && asUtc.getUTCMonth() === month - 1 && asUtc.getUTCDate() === day;
  if (!realDay) {
    throw new Error(`Несуществующая дата: «${date}». Нужен реальный день в формате YYYY-MM-DD.`);
  }
}

/** Дневной отчёт (итог дня) из report/list/calendar — запись с нужной eaten_date может отсутствовать. */
async function fetchDayReport(auth: FiziklAuth): Promise<DayReport[]> {
  return getJson<DayReport[]>(auth, `${FIZIKL_URLS.foodTracker}/api/v1/report/list/calendar/`);
}

/** Записи о съеденном за дату из eaten-food/list. */
async function fetchEatenFood(auth: FiziklAuth, date: string): Promise<EatenFoodItem[]> {
  return getJson<EatenFoodItem[]>(
    auth,
    `${FIZIKL_URLS.foodTracker}/api/v1/ration/eaten-food/list/?eaten_date=${date}`,
  );
}

/** Число без хвостовых нулей, с запасом в один знак после запятой. */
function fmtNum(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function mealLabel(slug: string): string {
  const name = MEAL_NAMES[slug] ?? slug;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatReport(date: string, report: DayReport): string {
  const line = (label: string, value: number | undefined, unit: string) =>
    `- ${label}: ${value === undefined ? "—" : `${fmtNum(value)} ${unit}`}`;
  return [
    `Итоги дня за ${date}:`,
    line("Калории", report.calories, "ккал"),
    line("Белки", report.protein, "г"),
    line("Жиры", report.fat, "г"),
    line("Углеводы", report.carbohydrate, "г"),
    line("Клетчатка", report.fiber, "г"),
    line("Вес еды", report.food_weight, "г"),
  ].join("\n");
}

function formatItem(item: EatenFoodItem): string {
  const name = item.food?.name || "(продукт без названия)";
  const amount = fmtNum(item.serving_amount);
  const servingName = item.serving?.name;
  const metricWeight = item.serving?.metric_weight;
  if (metricWeight === 1) {
    // Порция «г» (metric_weight 1) — способ записать «просто граммы».
    return `- ${name} — ${amount} г`;
  }
  if (servingName && metricWeight !== undefined) {
    return `- ${name} — ${amount} × «${servingName}» (${fmtNum(item.serving_amount * metricWeight)} г)`;
  }
  if (servingName) {
    return `- ${name} — ${amount} × «${servingName}»`;
  }
  return `- ${name} — ${amount}`;
}

function groupByMeal(items: EatenFoodItem[]): Map<string, EatenFoodItem[]> {
  const bySlug = new Map<string, EatenFoodItem[]>();
  for (const item of items) {
    const list = bySlug.get(item.meal);
    if (list) {
      list.push(item);
    } else {
      bySlug.set(item.meal, [item]);
    }
  }
  const ordered = new Map<string, EatenFoodItem[]>();
  for (const slug of MEAL_ORDER) {
    const list = bySlug.get(slug);
    if (list) ordered.set(slug, list);
  }
  for (const [slug, list] of bySlug) {
    if (!MEAL_ORDER.includes(slug)) ordered.set(slug, list);
  }
  return ordered;
}

function formatEatenFood(date: string, items: EatenFoodItem[]): string {
  const lines: string[] = [`Съеденное за ${date}:`];
  for (const [slug, mealItems] of groupByMeal(items)) {
    lines.push("", `${mealLabel(slug)}:`, ...mealItems.map(formatItem));
  }
  return lines.join("\n");
}

export async function getDaySummary(auth: FiziklAuth, options: GetDaySummaryOptions = {}): Promise<string> {
  const date = options.date ?? todayDateString(options.now);
  validateDate(date);
  // Запросы последовательно: getAccess() в FiziklAuth не защищён от параллельного двойного логина.
  const reports = await fetchDayReport(auth);
  const items = await fetchEatenFood(auth, date);

  const report = reports.find((entry) => entry.eaten_date === date);
  if (!report && items.length === 0) {
    return `За ${date} ничего не съедено: записей нет, дневной отчёт не найден.`;
  }

  const parts: string[] = [];
  if (report) {
    parts.push(formatReport(date, report));
  } else {
    parts.push(`Дневной отчёт за ${date} не найден — итогов нет (за день без съеденного отчёт не создаётся).`);
  }
  parts.push(items.length > 0 ? formatEatenFood(date, items) : `Съеденное за ${date}: записей нет.`);
  return parts.join("\n\n");
}
