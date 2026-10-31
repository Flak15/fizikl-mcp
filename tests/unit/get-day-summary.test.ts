import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDaySummary } from "../../src/tools/get-day-summary.js";
import { FOOD_TRACKER_BASE, makeAuth, mockLogin, setupMock, teardownMock, type MockEnv } from "../helpers.js";

const CALENDAR_PATH = "/api/v1/report/list/calendar/";
const EATEN_FOOD_PATH = "/api/v1/ration/eaten-food/list/";

describe("getDaySummary", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  function mockCalendar(access: string, reports: unknown[]): void {
    env.foodTrackerPool
      .intercept({ path: CALENDAR_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
      .reply(200, reports);
  }

  function mockEatenFood(access: string, date: string, items: unknown[]): void {
    env.foodTrackerPool
      .intercept({
        path: `${EATEN_FOOD_PATH}?eaten_date=${date}`,
        method: "GET",
        headers: { authorization: `Secret ${access}` },
      })
      .reply(200, items);
  }

  it("без аргумента берёт сегодня из локального now; пустой день — русский ответ, не ошибка", async () => {
    const access = mockLogin(env);
    mockCalendar(access, []);
    mockEatenFood(access, "2026-10-31", []);

    const text = await getDaySummary(makeAuth(env), { now: new Date("2026-10-31T23:59:00") });

    expect(text).toContain("2026-10-31");
    expect(text).toMatch(/ничего не съедено/i);
  });

  it("обе секции: итоги дня по eaten_date и записи, сгруппированные по приёмам пищи", async () => {
    const access = mockLogin(env);
    // В календаре два дня — берём запись только с нужной eaten_date.
    mockCalendar(access, [
      {
        pk: 5248000,
        eaten_date: "2026-10-30",
        calories: 1500,
        protein: 90,
        fat: 50,
        carbohydrate: 120,
        fiber: 15,
        food_weight: 700,
      },
      {
        pk: 5248538,
        eaten_date: "2026-10-31",
        calories: 1851.4,
        protein: 109.2,
        fat: 74.6,
        carbohydrate: 181.6,
        fiber: 24,
        food_weight: 921.6,
      },
    ]);
    mockEatenFood(access, "2026-10-31", [
      {
        id: 1,
        meal: "obed",
        serving_amount: 150,
        food: { id: 555, name: "Куриная грудка, отварная" },
        serving: { id: 888, name: "г", metric_weight: 1 },
      },
      {
        id: 2,
        meal: "zavtrak",
        serving_amount: 80,
        food: { id: 143370, name: "Крупа гречневая, сухая" },
        serving: { id: 293021, name: "г", metric_weight: 1 },
      },
      {
        id: 3,
        meal: "obed",
        serving_amount: 1.5,
        food: { id: 1488052, name: "Йогурт греческий 2%" },
        serving: { id: 999, name: "порция", metric_weight: 80 },
      },
    ]);

    const text = await getDaySummary(makeAuth(env), { date: "2026-10-31" });

    // Секция итогов: КБЖУ, клетчатка, вес еды — от записи за 2026-10-31, не за 10-30.
    expect(text).toContain("Итоги дня за 2026-10-31");
    expect(text).toContain("Калории: 1851.4");
    expect(text).toContain("Белки: 109.2");
    expect(text).toContain("Жиры: 74.6");
    expect(text).toContain("Углеводы: 181.6");
    expect(text).toContain("Клетчатка: 24");
    expect(text).toContain("Вес еды: 921.6");
    expect(text).not.toContain("1500");

    // Секция записей: приём пищи, продукт, порция, количество.
    expect(text).toContain("Съеденное за 2026-10-31");
    expect(text).toContain("Завтрак:");
    expect(text).toContain("Обед:");
    // Порция «г» (metric_weight 1) — просто граммы.
    expect(text).toContain("Крупа гречневая, сухая — 80 г");
    expect(text).toContain("Куриная грудка, отварная — 150 г");
    // Именованная порция: количество × порция, вес в граммах.
    expect(text).toContain("Йогурт греческий 2% — 1.5 × «порция» (120 г)");
  });

  it("записи есть, а дневного отчёта нет — итоги помечены, записи показаны, не ошибка", async () => {
    const access = mockLogin(env);
    mockCalendar(access, []);
    mockEatenFood(access, "2026-10-31", [
      {
        id: 7,
        meal: "uzhin",
        serving_amount: 200,
        food: { id: 42, name: "Творог 5%" },
        serving: { id: 43, name: "г", metric_weight: 1 },
      },
    ]);

    const text = await getDaySummary(makeAuth(env), { date: "2026-10-31" });

    expect(text).toMatch(/отчёт.*не найден/i);
    expect(text).toContain("Ужин:");
    expect(text).toContain("Творог 5% — 200 г");
    expect(text).not.toMatch(/isError/i);
  });

  it("отчёт есть, а записей нет (всё удалено) — итоги показаны, записи помечены пустыми", async () => {
    const access = mockLogin(env);
    mockCalendar(access, [
      {
        pk: 5248538,
        eaten_date: "2026-10-31",
        calories: 1851.4,
        protein: 109.2,
        fat: 74.6,
        carbohydrate: 181.6,
        fiber: 24,
        food_weight: 921.6,
      },
    ]);
    mockEatenFood(access, "2026-10-31", []);

    const text = await getDaySummary(makeAuth(env), { date: "2026-10-31" });

    expect(text).toContain("Итоги дня за 2026-10-31");
    expect(text).toContain("Калории: 1851.4");
    expect(text).toMatch(/записей нет/i);
  });

  it("неверный формат даты — русскоязычная ошибка до запросов к API", async () => {
    const access = mockLogin(env);
    // Перехватчики не регистрируем намеренно: любой запрос упал бы с «Mock dispatch not matched».
    await expect(getDaySummary(makeAuth(env), { date: "31.10.2026" })).rejects.toThrow(
      /формат.*YYYY-MM-DD/i,
    );
    await expect(getDaySummary(makeAuth(env), { date: "2026-13-45" })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(getDaySummary(makeAuth(env), { date: "2026-02-30" })).rejects.toThrow(/YYYY-MM-DD/);
  });
});
