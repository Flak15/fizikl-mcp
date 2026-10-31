import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatSearchResults, searchFood, searchFoodCards } from "../../src/tools/search-food.js";
import { makeAuth, mockLogin, setupMock, teardownMock, type MockEnv } from "../helpers.js";

const SEARCH_PATH = "/api/v1/search/food/";

/** Путь поиска, ровно как его строит searchFood (query first, page_size = лимит). */
function searchPath(query: string, pageSize: number): string {
  const params = new URLSearchParams({
    query,
    page_size: String(pageSize),
    page: "1",
    is_base: "false",
  });
  return `${SEARCH_PATH}?${params.toString()}`;
}

function mockSearch(env: MockEnv, query: string, pageSize: number, ids: string[]): void {
  const access = mockLogin(env);
  env.searchPool
    .intercept({ path: searchPath(query, pageSize), method: "GET", headers: { authorization: `Secret ${access}` } })
    .reply(200, ids);
}

function mockCard(env: MockEnv, id: number, name: string): void {
  env.foodTrackerPool
    .intercept({ path: `/api/v1/food/${id}/`, method: "GET" })
    .reply(200, {
      id,
      name,
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

describe("searchFood", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  it("гидратирует топ-N: карточки с названиями и порциями, а не голые ID; порция «г» подсвечена", async () => {
    mockSearch(env, "гречка", 10, ["143370", "143369"]);
    mockCard(env, 143370, "Крупа гречневая, сухая");
    mockCard(env, 143369, "Гречка отварная");

    const text = await searchFood(makeAuth(env), "гречка");

    // Названия приходят только из карточек — значит, гидратация была
    expect(text).toContain("Крупа гречневая, сухая");
    expect(text).toContain("143370");
    expect(text).toContain("Гречка отварная");
    expect(text).toContain("«порция» — 80 г");
    // Порция «г» (metric_weight: 1) помечена как способ записать «просто граммы»
    expect(text).toMatch(/«г» — 1 г.*просто граммы/);
    expect(text).toContain("28.35 г");
  });

  it("limit ограничивает: page_size = limit в поиске, гидратируется ровно топ-N", async () => {
    mockSearch(env, "творог", 2, ["111", "222", "333"]);
    // Карточки мокаем только для топ-2: запрос 333-й (за лимитом) упал бы — тест поймает
    mockCard(env, 111, "Творог 5%");
    mockCard(env, 222, "Творог обезжиренный");

    const text = await searchFood(makeAuth(env), "творог", 2);

    expect(text).toContain("Творог 5%");
    expect(text).toContain("Творог обезжиренный");
    expect(text).toMatch(/топ-2/);
  });

  it("по умолчанию limit = 10 и page_size = 10", async () => {
    mockSearch(env, "кефир", 10, ["555"]);
    mockCard(env, 555, "Кефир 1%");

    const text = await searchFood(makeAuth(env), "кефир");
    expect(text).toContain("Кефир 1%");
  });

  it.each([0, -1, 11, 2.5, Number.NaN])(
    "невалидный limit (%p) — русскоязычная ошибка, ничего не искать",
    async (limit) => {
      // Ни логина, ни поиска не замокано: любой HTTP-запрос упал бы — и ошибка была бы другой
      await expect(searchFood(makeAuth(env), "гречка", limit)).rejects.toThrow(/[Лл]имит/);
    },
  );

  it("пустая выдача — понятный русский ответ, не ошибка, без запросов карточек", async () => {
    mockSearch(env, "ыыы", 10, []);

    const text = await searchFood(makeAuth(env), "ыыы");

    expect(text).toMatch(/ничего не найдено/i);
    expect(text).toContain("ыыы");
  });

  it("searchFoodCards отдаёт структуру (total + карточки): smoke берёт id из данных, не из текста", async () => {
    mockSearch(env, "гречка", 3, ["143370", "143369"]);
    mockCard(env, 143370, "Крупа гречневая, сухая");
    mockCard(env, 143369, "Гречка отварная");

    const { total, cards } = await searchFoodCards(makeAuth(env), "гречка", 3);

    expect(total).toBe(2);
    expect(cards.map((card) => card.id)).toEqual([143370, 143369]);
    expect(cards[0]?.name).toBe("Крупа гречневая, сухая");
    expect(cards[1]?.name).toBe("Гречка отварная");
  });

  it("formatSearchResults: пустая выдача — тот же русский текст, что у searchFood", () => {
    expect(formatSearchResults("ыыы", 0, [], 10)).toMatch(/ничего не найдено/i);
  });

  it("404 при гидратации карточки — ошибка API Физикла", async () => {
    mockSearch(env, "гречка", 10, ["999"]);
    env.foodTrackerPool
      .intercept({ path: "/api/v1/food/999/", method: "GET" })
      .reply(404, { detail: "Не найдено." });

    await expect(searchFood(makeAuth(env), "гречка")).rejects.toThrow(/HTTP 404/);
  });
});
