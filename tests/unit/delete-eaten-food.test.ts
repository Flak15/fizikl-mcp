import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteEatenFood } from "../../src/tools/delete-eaten-food.js";
import { FOOD_TRACKER_BASE, makeAuth, mockLogin, setupMock, teardownMock, type MockEnv } from "../helpers.js";

function destroyPath(id: number): string {
  return `/api/v1/ration/eaten-food/destroy/${id}/`;
}

describe("deleteEatenFood", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  it("удаляет запись (DELETE destroy/{id} → 204) и подтверждает в ответе", async () => {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({
        path: destroyPath(24402683),
        method: "DELETE",
        headers: { authorization: `Secret ${access}` },
      })
      .reply(204, "");

    const text = await deleteEatenFood(makeAuth(env), 24402683);
    expect(text).toContain("24402683");
    expect(text).toContain("удален");
    env.agent.assertNoPendingInterceptors();
  });

  it("повторное удаление (404) — понятная русская ошибка", async () => {
    const access = mockLogin(env);
    env.foodTrackerPool
      .intercept({
        path: destroyPath(24402683),
        method: "DELETE",
        headers: { authorization: `Secret ${access}` },
      })
      .reply(404, { detail: "Не найдено." });

    await expect(deleteEatenFood(makeAuth(env), 24402683)).rejects.toThrowError(
      /24402683.*(не найдена|уже удалена)/s,
    );
  });
});
