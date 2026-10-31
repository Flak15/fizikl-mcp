/**
 * Единый дом для человекочитаемых форматтеров: локальная дата YYYY-MM-DD,
 * шаблон даты и числа без хвостовых нулей. Чистые функции — тесты фиксируют
 * значения без fake timers.
 */

/** Локальная календарная дата YYYY-MM-DD без времени (дефолт ADR-0005). */
export function today(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Шаблон календарной даты (eaten_date, дата отчёта): YYYY-MM-DD. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Число без хвостовых нулей, с запасом в один знак после запятой. */
export function fmtNum(value: number): string {
  return String(Math.round(value * 10) / 10);
}
