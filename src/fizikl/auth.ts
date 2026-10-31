import fs from "node:fs";
import path from "node:path";
import { FIZIKL_URLS } from "../config.js";

export class FiziklAuthError extends Error {
  constructor(
    message: string,
    /** HTTP-статус ответа, если ошибка пришла с сервера (нет статуса — сетевая проблема). */
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface Credentials {
  login: string;
  password: string;
}

export interface FiziklAuthOptions {
  credentials: Credentials;
  authFilePath: string;
}

interface TokenResponse {
  access: string;
  refresh: string;
}

export class FiziklAuth {
  private access: string | null = null;
  private refresh: string | null = null;

  constructor(private readonly options: FiziklAuthOptions) {
    this.refresh = this.loadPersistedRefresh();
  }

  /** Access отвергнут сервером (401 у клиента): сбрасываем, следующий getAccess сделает refresh. */
  invalidate(): void {
    this.access = null;
  }

  async getAccess(): Promise<string> {
    if (this.access && !this.isExpired(this.access)) {
      return this.access;
    }
    if (this.refresh) {
      try {
        return await this.refreshAccess();
      } catch (error) {
        // На сетевой ошибке или 5xx ре-логин бессмысленен — ждём восстановления.
        const recoverable = error instanceof FiziklAuthError && error.status !== undefined && error.status < 500;
        if (!recoverable) throw error;
      }
    }
    return await this.login();
  }

  /** Запас в 60 секунд: токен на грани истечения считаем мёртвым. */
  private isExpired(token: string): boolean {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
      if (typeof payload.exp !== "number") return true;
      return payload.exp * 1000 <= Date.now() + 60_000;
    } catch {
      return true;
    }
  }

  private async refreshAccess(): Promise<string> {
    const res = await this.request("/jwt-auth/api/token/refresh/", { refresh: this.refresh });
    if (!res.ok) {
      throw new FiziklAuthError(`Не удалось обновить токен Физикла (HTTP ${res.status}).`, res.status);
    }
    const data = (await res.json()) as Partial<TokenResponse>;
    if (!data.access) {
      throw new FiziklAuthError("Сервис авторизации Физикла не вернул access-токен.");
    }
    this.access = data.access;
    if (data.refresh) {
      this.refresh = data.refresh;
      this.persist();
    }
    return data.access;
  }

  private async login(): Promise<string> {
    const res = await this.request("/jwt-auth/api/token/", {
      username: this.options.credentials.login,
      password: this.options.credentials.password,
    });
    if (!res.ok) {
      throw new FiziklAuthError(`Не удалось войти в Физикл (HTTP ${res.status}). Проверьте LOGIN и PASSWORD в .env.`, res.status);
    }
    const data = (await res.json()) as TokenResponse;
    this.access = data.access;
    this.refresh = data.refresh;
    this.persist();
    return data.access;
  }

  private async request(pathname: string, body: Record<string, unknown>): Promise<Response> {
    try {
      return await fetch(`${FIZIKL_URLS.auth}${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new FiziklAuthError(`Нет связи с сервисом авторизации Физикла (${FIZIKL_URLS.auth}).`, undefined, { cause });
    }
  }

  private loadPersistedRefresh(): string | null {
    try {
      const raw = fs.readFileSync(this.options.authFilePath, "utf8");
      const parsed = JSON.parse(raw) as { refresh?: string };
      return typeof parsed.refresh === "string" ? parsed.refresh : null;
    } catch {
      return null;
    }
  }

  private persist(): void {
    if (!this.refresh) return;
    fs.mkdirSync(path.dirname(this.options.authFilePath), { recursive: true });
    fs.writeFileSync(this.options.authFilePath, JSON.stringify({ refresh: this.refresh }));
    fs.chmodSync(this.options.authFilePath, 0o600);
  }
}
