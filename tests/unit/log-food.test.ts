import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { today } from "../../src/tools/format.js";
import {
  createEatenFood,
  formatCreatedEatenFood,
  logFood,
  pickMeal,
  resetMealsCache,
  type LogFoodArgs,
} from "../../src/tools/log-food.js";
import { FOOD_TRACKER_BASE, makeAuth, mockLogin, setupMock, teardownMock, type MockEnv } from "../helpers.js";

const MEALS_PATH = "/api/v1/ration/meal/list/";
const CREATE_PATH = "/api/v1/ration/eaten-food/create-list/";

/** Стандартные 4 приёма пищи — ответ meal/list. */
const MEALS = [
  { id: 28742, name: "завтрак", slug: "zavtrak", is_enable: true, is_default: true },
  { id: 28743, name: "обед", slug: "obed", is_enable: true, is_default: true },
  { id: 28744, name: "ужин", slug: "uzhin", is_enable: true, is_default: true },
  { id: 28745, name: "перекус", slug: "perekus", is_enable: true, is_default: true },
];

/** Локальное «сейчас» в заданный час/минуту фиксированного дня. */
function at(hours: number, minutes = 0): Date {
  return new Date(2026, 9, 31, hours, minutes);
}

describe("pickMeal (окна времени ADR-0005)", () => {
  it.each([
    [3, 59, "perekus"], // до 04:00 — ещё перекус
    [4, 0, "zavtrak"], // [04:00, 12:00)
    [11, 59, "zavtrak"],
    [12, 0, "obed"], // [12:00, 18:00)
    [17, 59, "obed"],
    [18, 0, "uzhin"], // [18:00, 21:00)
    [20, 59, "uzhin"],
    [21, 0, "perekus"], // [21:00, 04:00) — через полночь
    [23, 59, "perekus"],
    [0, 0, "perekus"], // полночь — перекус
  ])("в %02d:%02d подбирает %s", (hours, minutes, expected) => {
    expect(pickMeal(at(hours, minutes))).toBe(expected);
  });
});

describe("today", () => {
  it("форматирует локальную дату как YYYY-MM-DD с ведущими нулями", () => {
    expect(today(new Date(2026, 9, 31, 14, 30))).toBe("2026-10-31");
    expect(today(new Date(2026, 2, 5, 1, 5))).toBe("2026-03-05");
  });
});

describe("logFood", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
    resetMealsCache(); // кэш приёмов — модульное состояние, не тащим между тестами
  });
  afterEach(() => teardownMock());

  /** Мокает meal/list и перехватывает POST create-list, запоминая разобранное тело запроса. */
  function mockCreate(sent: { body?: unknown }): void {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
      .reply(200, MEALS);
    env.foodTrackerPool
      .intercept({
        path: CREATE_PATH,
        method: "POST",
        headers: { authorization: `Secret ${access}`, "content-type": "application/json" },
      })
      .reply(201, (opts: { body: string }) => {
        sent.body = JSON.parse(opts.body);
        return [{ id: 24402683 }];
      });
  }

  it("«200 г гречки в обед»: массив из одного элемента в create-list, явные meal и дата названы в ответе", async () => {
    const sent: { body?: unknown } = {};
    mockCreate(sent);

    const text = await logFood(
      makeAuth(env),
      { servingId: 293021, servingAmount: 200, meal: "obed", eatenDate: "2026-10-31" },
      new Date(2026, 9, 31, 14, 30),
    );

    expect(sent.body).toEqual([
      { serving: 293021, serving_amount: 200, meal: "obed", eaten_date: "2026-10-31" },
    ]);
    expect(text).toContain("24402683"); // id созданной записи
    expect(text).toContain("обед (obed)");
    expect(text).toContain("задан явно");
    expect(text).toContain("задана явно");
  });

  it("без meal и eaten_date применяет дефолты по фиксированному «сейчас» и называет их в ответе", async () => {
    const sent: { body?: unknown } = {};
    mockCreate(sent);

    // 14:30 → окно обеда; 2026-11-02 → сегодня
    const text = await logFood(
      makeAuth(env),
      { servingId: 293021, servingAmount: 150 },
      new Date(2026, 10, 2, 14, 30),
    );

    expect(sent.body).toEqual([
      { serving: 293021, serving_amount: 150, meal: "obed", eaten_date: "2026-11-02" },
    ]);
    expect(text).toContain("обед (obed)");
    expect(text).toContain("подобран по времени");
    expect(text).toContain("сегодня, 2026-11-02");
    expect(text).not.toContain("задан явно"); // дефолт не должен маскироваться под явный выбор
  });

  it("явный meal и явная eaten_date перекрывают автоподбор", async () => {
    const sent: { body?: unknown } = {};
    mockCreate(sent);

    // сейчас 14:30 → автоподбор дал бы obed и «сегодня» (2026-10-31)
    const text = await logFood(
      makeAuth(env),
      { servingId: 293021, servingAmount: 100, meal: "uzhin", eatenDate: "2026-11-05" },
      new Date(2026, 9, 31, 14, 30),
    );

    expect(sent.body).toEqual([
      { serving: 293021, serving_amount: 100, meal: "uzhin", eaten_date: "2026-11-05" },
    ]);
    expect(text).toContain("ужин (uzhin)");
    expect(text).toContain("задан явно");
    expect(text).toContain("2026-11-05 — задана явно");
    expect(text).not.toContain("подобран по времени");
  });

  it.each([0, 0.009, Number.NaN])(
    "serving_amount %s (< 0.01) — русская ошибка, ничего не записано",
    async (amount) => {
      mockLogin(env); // auth отвечает, но ни meal/list, ни create-list не замоканы:
      // если бы код дошёл до сети — упал бы на meal/list с английской MockException, не с нашей ошибкой
      await expect(
        logFood(makeAuth(env), { servingId: 293021, servingAmount: amount }, new Date(2026, 9, 31, 14, 30)),
      ).rejects.toThrowError(/serving_amount.*0\.01|0\.01.*serving_amount/s);
    },
  );

  it("неизвестный slug приёма — русская ошибка с доступными slug, ничего не записано", async () => {
    const access = mockLogin(env);
    // meal/list замокан, POST create-list — НЕТ: запись не должна уйти
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
      .reply(200, MEALS);

    await expect(
      logFood(
        makeAuth(env),
        { servingId: 293021, servingAmount: 200, meal: "poldnik" },
        new Date(2026, 9, 31, 14, 30),
      ),
    ).rejects.toThrowError(/«poldnik» не найден.*zavtrak.*obed.*uzhin.*perekus/s);
  });

  it("createEatenFood возвращает структурный итог: id записи и применённые meal и дату", async () => {
    const sent: { body?: unknown } = {};
    mockCreate(sent);

    const created = await createEatenFood(
      makeAuth(env),
      { servingId: 293021, servingAmount: 200, meal: "obed", eatenDate: "2026-10-31" },
      new Date(2026, 9, 31, 14, 30),
    );

    expect(created.id).toBe(24402683);
    expect(created.eatenDate).toBe("2026-10-31");
    expect(created.meal.slug).toBe("obed");
    expect(created.meal.name).toBe("обед");
    expect(sent.body).toEqual([
      { serving: 293021, serving_amount: 200, meal: "obed", eaten_date: "2026-10-31" },
    ]);
  });

  it("формат от структурного итога совпадает с текстом logFood байт-в-байт", async () => {
    const access = mockLogin(env);
    const auth = makeAuth(env); // один инстанс: после первого логина access кэшируется
    const args: LogFoodArgs = { servingId: 293021, servingAmount: 150, meal: "obed", eatenDate: "2026-10-31" };
    const now = new Date(2026, 9, 31, 14, 30);

    // Одинаковый раунд meal/list + create-list на каждый вызов (один access — один заголовок).
    const mockRound = (): void => {
      env.foodTrackerPool
        .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
        .reply(200, MEALS);
      env.foodTrackerPool
        .intercept({
          path: CREATE_PATH,
          method: "POST",
          headers: { authorization: `Secret ${access}`, "content-type": "application/json" },
        })
        .reply(201, [{ id: 24402683 }]);
    };

    mockRound();
    const text = await logFood(auth, args, now);

    mockRound();
    const created = await createEatenFood(auth, args, now);
    expect(formatCreatedEatenFood(created, args, now)).toBe(text);
  });

  it("meal/list кэшируется на процесс: повторная запись не ходит за приёмами в сеть", async () => {
    const access = mockLogin(env);
    // meal/list перехвачен РОВНО один раз (по умолчанию), create-list — дважды:
    // второй logFood, сходит ли он за meal/list, упал бы с MockException.
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
      .reply(200, MEALS);
    env.foodTrackerPool
      .intercept({
        path: CREATE_PATH,
        method: "POST",
        headers: { authorization: `Secret ${access}`, "content-type": "application/json" },
      })
      .reply(201, [{ id: 1 }])
      .times(2);

    const auth = makeAuth(env);
    const args: LogFoodArgs = { servingId: 293021, servingAmount: 100, meal: "obed" };

    await logFood(auth, args, new Date(2026, 9, 31, 14, 30));
    await logFood(auth, args, new Date(2026, 9, 31, 14, 30)); // вторая запись — из кэша
  });

  it("ответ create-list без id — русская ошибка: запись-сирота не остаётся незамеченной", async () => {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
      .reply(200, MEALS);
    env.foodTrackerPool
      .intercept({
        path: CREATE_PATH,
        method: "POST",
        headers: { authorization: `Secret ${access}`, "content-type": "application/json" },
      })
      .reply(201, [{}]);

    await expect(
      logFood(makeAuth(env), { servingId: 293021, servingAmount: 100 }, new Date(2026, 9, 31, 14, 30)),
    ).rejects.toThrowError(/не вернул id/);
  });
});
