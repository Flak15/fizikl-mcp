import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FiziklAuthError } from "../../src/fizikl/auth.js";
import { makeAuth, makeJwt, setupMock, teardownMock, type MockEnv } from "../helpers.js";

describe("FiziklAuth", () => {
  let env: MockEnv;

  beforeEach(() => {
    env = setupMock();
  });
  afterEach(() => teardownMock());

  it("не делает сетевых запросов до первого getAccess, логин даёт access, refresh сохраняется в файл с правами 600", async () => {
    const access = makeJwt(3600);
    const refresh = "refresh-token-1";

    // Конструируем до любых интерсепторов: disableNetConnect превратит любой запрос в ошибку
    const auth = makeAuth(env);

    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(200, { access, refresh });

    expect(await auth.getAccess()).toBe(access);
    expect(JSON.parse(fs.readFileSync(env.authFilePath, "utf8"))).toEqual({ refresh });
    expect(fs.statSync(env.authFilePath).mode & 0o777).toBe(0o600);
  });

  it("refresh из файла переживает рестарт: новый экземпляр получает access через /token/refresh/, без полного логина", async () => {
    const access = makeJwt(3600);
    fs.writeFileSync(env.authFilePath, JSON.stringify({ refresh: "refresh-token-1" }));

    env.authPool
      .intercept({ path: "/jwt-auth/api/token/refresh/", method: "POST" })
      .reply(200, { access });

    expect(await makeAuth(env).getAccess()).toBe(access);
  });

  it("повторный getAccess с живым access не делает сетевых запросов", async () => {
    const access = makeJwt(3600);
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(200, { access, refresh: "refresh-token-1" });

    const auth = makeAuth(env);
    await auth.getAccess();
    // Ни одного незакрытого интерсептора не осталось — второй вызов ушёл бы в disableNetConnect и упал
    expect(await auth.getAccess()).toBe(access);
  });

  it("истёкший access обновляется через refresh-эндпоинт", async () => {
    const expired = makeJwt(-60);
    const fresh = makeJwt(3600);
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(200, { access: expired, refresh: "refresh-token-1" });
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/refresh/", method: "POST" })
      .reply(200, { access: fresh });

    const auth = makeAuth(env);
    await auth.getAccess();
    expect(await auth.getAccess()).toBe(fresh);
  });

  it("invalidate() сбрасывает access: следующий getAccess делает refresh даже при живом access; ротация refresh перезаписывает файл", async () => {
    const access1 = makeJwt(3600);
    const access2 = makeJwt(7200);
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(200, { access: access1, refresh: "refresh-old" });
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/refresh/", method: "POST" })
      .reply(200, { access: access2, refresh: "refresh-new" });

    const auth = makeAuth(env);
    await auth.getAccess();
    auth.invalidate();
    expect(await auth.getAccess()).toBe(access2);
    expect(JSON.parse(fs.readFileSync(env.authFilePath, "utf8"))).toEqual({ refresh: "refresh-new" });
  });

  it("мёртвый refresh (401) приводит к полному ре-логину", async () => {
    const access1 = makeJwt(3600);
    const access2 = makeJwt(3600);
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(200, { access: access1, refresh: "refresh-dead" });
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/refresh/", method: "POST" })
      .reply(401, { detail: "Token is invalid or expired" });
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(200, { access: access2, refresh: "refresh-alive" });

    const auth = makeAuth(env);
    await auth.getAccess();
    auth.invalidate();
    expect(await auth.getAccess()).toBe(access2);
    expect(JSON.parse(fs.readFileSync(env.authFilePath, "utf8"))).toEqual({ refresh: "refresh-alive" });
  });

  it("неудачный ре-логин — русскоязычная ошибка про креды", async () => {
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/refresh/", method: "POST" })
      .reply(401, { detail: "Token is invalid or expired" });
    env.authPool
      .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
      .reply(401, { detail: "No active account found with the given credentials" });
    fs.writeFileSync(env.authFilePath, JSON.stringify({ refresh: "refresh-dead" }));

    const auth = makeAuth(env);
    await expect(auth.getAccess()).rejects.toThrowError(/LOGIN и PASSWORD/);
  });

  it("сетевая ошибка логина — русскоязычная ошибка, не сырой TypeError", async () => {
    // Интерсепторов нет, net отключён — fetch падает на соединении
    const auth = makeAuth(env);
    await expect(auth.getAccess()).rejects.toThrowError(FiziklAuthError);
    await expect(auth.getAccess()).rejects.toThrowError(/связи/);
  });
});
