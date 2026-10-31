import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getFood } from "../../src/tools/get-food.js";
import { makeAuth, mockLogin, setupMock, teardownMock, type MockEnv } from "../helpers.js";

const BUCKWHEAT_PATH = "/api/v1/food/143370/";

function mockBuckwheat(env: MockEnv): void {
  const access = mockLogin(env);
  env.foodTrackerPool
    .intercept({ path: BUCKWHEAT_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
    .reply(200, {
      id: 143370,
      name: "Крупа гречневая, сухая",
      brand_name: null,
      is_base: true,
      category: { id: 1452, name: "Гречневая крупа (сухая)" },
      default_serving: { id: 293021, serving_amount: 100 },
      food_servings: [
        { id: 293022, name: "oz", metric_weight: 28.3495, calories: 97.2, protein: 10.1, fat: 2.2, carbohydrate: 60.4 },
        { id: 1488052, name: "порция", metric_weight: 80, calories: 264, protein: 10.1, fat: 2.6, carbohydrate: 49.6 },
        { id: 293021, name: "г", metric_weight: 1, is_default: true, calories: 330, protein: 12.6, fat: 3.3, carbohydrate: 62 },
      ],
      cooking_coefficient: 2.5,
    });
}

describe("getFood", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  it("возвращает карточку: порции (id, название, metric_weight), КБЖУ порций, cooking_coefficient, «г» подсвечена", async () => {
    mockBuckwheat(env);

    const text = await getFood(makeAuth(env), "143370");

    expect(text).toContain("Крупа гречневая, сухая");
    expect(text).toContain("143370");
    expect(text).toContain("Гречневая крупа (сухая)");
    expect(text).toContain("2.5"); // cooking_coefficient
    expect(text).toContain("293021"); // id порции «г»
    expect(text).toContain("293022"); // id порции «oz»
    expect(text).toContain("28.35 г"); // metric_weight округлён
    expect(text).toContain("«порция» — 80 г");
    expect(text).toMatch(/«г» — 1 г.*просто граммы/);
    expect(text).toContain("330 ккал"); // КБЖУ порции «г»
    expect(text).toContain("Б 12.6");
  });

  it("принимает id числом, а не только строкой", async () => {
    mockBuckwheat(env);

    const text = await getFood(makeAuth(env), 143370);
    expect(text).toContain("Крупа гречневая, сухая");
  });

  it("нечисловой id — русскоязычная ошибка без запроса", async () => {
    // Ничего не замокано: любой запрос упал бы с другой ошибкой
    await expect(getFood(makeAuth(env), "гречка")).rejects.toThrow(/id.*числ/);
  });

  it("404 карточки — ошибка API Физикла с деталью сервера", async () => {
    mockLogin(env);
    env.foodTrackerPool
      .intercept({ path: "/api/v1/food/999/", method: "GET" })
      .reply(404, { detail: "Не найдено." });

    const error = await getFood(makeAuth(env), "999").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/HTTP 404/);
    expect(error.message).toContain("Не найдено.");
  });
});
