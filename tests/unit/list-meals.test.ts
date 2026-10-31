import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listMeals } from "../../src/tools/list-meals.js";
import { FOOD_TRACKER_BASE, makeAuth, mockLogin, setupMock, teardownMock, type MockEnv } from "../helpers.js";

const MEALS_PATH = "/api/v1/ration/meal/list/";

describe("listMeals", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  function mockMeals(): void {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({
        path: MEALS_PATH,
        method: "GET",
        headers: { authorization: `Secret ${access}` },
      })
      .reply(200, [
        { id: 28742, name: "завтрак", slug: "zavtrak", is_enable: true, is_default: true },
        { id: 28743, name: "обед", slug: "obed", is_enable: true, is_default: true },
        { id: 28744, name: "ужин", slug: "uzhin", is_enable: true, is_default: true },
        { id: 28745, name: "перекус", slug: "perekus", is_enable: true, is_default: true },
        { id: 99999, name: "пятый приём", slug: "pyaty", is_enable: false, is_default: false },
      ]);
  }

  it("возвращает русские названия и slug включённых приёмов пищи", async () => {
    mockMeals();
    const text = await listMeals(makeAuth(env));

    expect(text).toContain("завтрак");
    expect(text).toContain("zavtrak");
    expect(text).toContain("перекус");
    expect(text).toContain("perekus");
    expect(text).not.toContain("пятый приём"); // выключенные не показываем
  });

  it("пустой список приёмов — понятный русский ответ, не ошибка", async () => {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
      .reply(200, []);

    const text = await listMeals(makeAuth(env));
    expect(text).toMatch(/приём/i);
  });
});
