import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent, MockAgent, setGlobalDispatcher } from "undici";
import { FiziklAuth } from "../src/fizikl/auth.js";

export const AUTH_BASE = "https://pht.space";
export const FOOD_TRACKER_BASE = "https://food-tracker.pht.space";

export const credentials = { login: "user@example.com", password: "secret-pass" };

export function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export function makeJwt(expiresInSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ exp })}.sig`;
}

export interface MockEnv {
  agent: MockAgent;
  authPool: ReturnType<MockAgent["get"]>;
  foodTrackerPool: ReturnType<MockAgent["get"]>;
  authFilePath: string;
}

export function setupMock(): MockEnv {
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fizikl-test-"));
  return {
    agent,
    authPool: agent.get(AUTH_BASE),
    foodTrackerPool: agent.get(FOOD_TRACKER_BASE),
    authFilePath: path.join(dir, "auth.json"),
  };
}

export function teardownMock(): void {
  setGlobalDispatcher(new Agent());
}

/** Мокает успешный логин; возвращает access-токен (для матчинга заголовка Secret). */
export function mockLogin(env: MockEnv): string {
  const access = makeJwt(3600);
  env.authPool
    .intercept({ path: "/jwt-auth/api/token/", method: "POST" })
    .reply(200, { access, refresh: "refresh-token-1" });
  return access;
}

export function makeAuth(env: MockEnv): FiziklAuth {
  return new FiziklAuth({ credentials, authFilePath: env.authFilePath });
}
