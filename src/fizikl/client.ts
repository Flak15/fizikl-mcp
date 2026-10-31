import type { FiziklAuth } from "./auth.js";

export class FiziklApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * GET-запрос к микросервису Физикла с Secret-схемой авторизации.
 * При 401 сбрасывает access (refresh/ре-логин) и повторяет запрос один раз.
 */
export async function getJson<T>(auth: FiziklAuth, url: string): Promise<T> {
  let res = await fetchJson(auth, url);
  if (res.status === 401) {
    auth.invalidate();
    res = await fetchJson(auth, url);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Тело не JSON — оставим только статус
    }
    throw new FiziklApiError(
      `Ошибка API Физикла (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

async function fetchJson(auth: FiziklAuth, url: string): Promise<Response> {
  const access = await auth.getAccess();
  try {
    return await fetch(url, { headers: { Authorization: `Secret ${access}` } });
  } catch (cause) {
    throw new FiziklApiError(`Нет связи с Физиклом (${new URL(url).host}).`, undefined, { cause });
  }
}
