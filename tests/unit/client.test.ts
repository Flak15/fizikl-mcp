import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FiziklApiError, deleteResource, getJson, sendJson } from "../../src/fizikl/client.js";
import {
  FOOD_TRACKER_BASE,
  makeAuth,
  makeJwt,
  mockLogin,
  setupMock,
  teardownMock,
  type MockEnv,
} from "../helpers.js";

const MEALS_PATH = "/api/v1/ration/meal/list/";

describe("getJson", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  it("несёт Authorization: Secret <access> и возвращает JSON ответа", async () => {
    const access = mockLogin(env);
    // Матчинг по заголовку: без правильного Secret интерсептор не сработает и тест упадёт
    env.foodTrackerPool
      .intercept({
        path: MEALS_PATH,
        method: "GET",
        headers: { authorization: `Secret ${access}` },
      })
      .reply(200, [{ id: 1, name: "завтрак", slug: "zavtrak" }]);

    const data = await getJson<unknown[]>(makeAuth(env), `${FOOD_TRACKER_BASE}${MEALS_PATH}`);
    expect(data).toEqual([{ id: 1, name: "завтрак", slug: "zavtrak" }]);
    env.agent.assertNoPendingInterceptors();
  });

  it("при 401 сбрасывает access, обновляет через refresh и повторяет запрос один раз", async () => {
    const access1 = makeJwt(3600);
    const access2 = makeJwt(3600);
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(200, { access: access1, refresh: "refresh-token-1" });
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access1}` } })
      .reply(401, { detail: "Unauthorized" });
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/refresh/", method: "POST" })
      .reply(200, { access: access2 });
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access2}` } })
      .reply(200, [{ id: 1, name: "завтрак", slug: "zavtrak" }]);

    const data = await getJson<unknown[]>(makeAuth(env), `${FOOD_TRACKER_BASE}${MEALS_PATH}`);
    expect(data).toEqual([{ id: 1, name: "завтрак", slug: "zavtrak" }]);
    env.agent.assertNoPendingInterceptors();
  });

  it("повторный 401 после refresh — русскоязычная ошибка", async () => {
    const access1 = makeJwt(3600);
    const access2 = makeJwt(3600);
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(200, { access: access1, refresh: "refresh-token-1" });
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access1}` } })
      .reply(401, { detail: "Unauthorized" });
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/refresh/", method: "POST" })
      .reply(200, { access: access2 });
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access2}` } })
      .reply(401, { detail: "Unauthorized" });

    await expect(getJson(makeAuth(env), `${FOOD_TRACKER_BASE}${MEALS_PATH}`)).rejects.toThrowError(
      /Ошибка API Физикла \(HTTP 401\)/,
    );
  });

  it("ошибка сервера (500) — FiziklApiError со статусом и detail из тела", async () => {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({ path: MEALS_PATH, method: "GET", headers: { authorization: `Secret ${access}` } })
      .reply(500, { detail: "Внутренняя ошибка" });

    const err = await getJson(makeAuth(env), `${FOOD_TRACKER_BASE}${MEALS_PATH}`).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FiziklApiError);
    expect((err as FiziklApiError).status).toBe(500);
    expect((err as Error).message).toContain("Внутренняя ошибка");
  });
});

describe("sendJson", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  const CREATE_PATH = "/api/v1/ration/eaten-food/create-list/";

  it("шлёт POST с JSON-телом и Secret-заголовком, возвращает JSON ответа", async () => {
    const access = mockLogin(env);
    // Матчинг по заголовку: без правильного Secret интерсептор не сработает и тест упадёт
    env.foodTrackerPool
      .intercept({
        path: CREATE_PATH,
        method: "POST",
        headers: { authorization: `Secret ${access}`, "content-type": "application/json" },
      })
      .reply(201, [{ id: 24402683 }]);

    const data = await sendJson<unknown[]>(makeAuth(env), `${FOOD_TRACKER_BASE}${CREATE_PATH}`, [
      { serving: 293021, serving_amount: 200, meal: "obed", eaten_date: "2026-10-31" },
    ]);
    expect(data).toEqual([{ id: 24402683 }]);
    env.agent.assertNoPendingInterceptors();
  });

  it("ошибка (400) — FiziklApiError со статусом и detail из тела", async () => {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({
        path: CREATE_PATH,
        method: "POST",
        headers: { authorization: `Secret ${access}`, "content-type": "application/json" },
      })
      .reply(400, { detail: "Неверный запрос" });

    const err = await sendJson(makeAuth(env), `${FOOD_TRACKER_BASE}${CREATE_PATH}`, {}).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FiziklApiError);
    expect((err as FiziklApiError).status).toBe(400);
    expect((err as Error).message).toContain("Неверный запрос");
  });
});

describe("deleteResource", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  const DESTROY_PATH = "/api/v1/ration/eaten-food/destroy/24402683/";

  it("шлёт DELETE с Secret-заголовком и возвращает статус ответа (204)", async () => {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({
        path: DESTROY_PATH,
        method: "DELETE",
        headers: { authorization: `Secret ${access}` },
      })
      .reply(204, "");

    const status = await deleteResource(makeAuth(env), `${FOOD_TRACKER_BASE}${DESTROY_PATH}`);
    expect(status).toBe(204);
    env.agent.assertNoPendingInterceptors();
  });

  it("не-2xx (404) — FiziklApiError со статусом", async () => {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({
        path: DESTROY_PATH,
        method: "DELETE",
        headers: { authorization: `Secret ${access}` },
      })
      .reply(404, { detail: "Не найдено." });

    const err = await deleteResource(makeAuth(env), `${FOOD_TRACKER_BASE}${DESTROY_PATH}`).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FiziklApiError);
    expect((err as FiziklApiError).status).toBe(404);
  });
});
