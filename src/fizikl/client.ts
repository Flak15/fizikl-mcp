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
  const res = await withAuthRetry(auth, () => request(auth, "GET", url));
  await ensureOk(res);
  return (await res.json()) as T;
}

/**
 * POST-запрос с JSON-телом; та же Secret-схема и повтор при 401, что у getJson.
 */
export async function sendJson<T>(auth: FiziklAuth, url: string, body: unknown): Promise<T> {
  const res = await withAuthRetry(auth, () => request(auth, "POST", url, JSON.stringify(body)));
  await ensureOk(res);
  return (await res.json()) as T;
}

/**
 * DELETE-запрос; успешный ответ обычно без тела (204), поэтому возвращаем статус.
 */
export async function deleteResource(auth: FiziklAuth, url: string): Promise<number> {
  const res = await withAuthRetry(auth, () => request(auth, "DELETE", url));
  await ensureOk(res);
  return res.status;
}

/** Один запрос (с обновлением access при 401 — ровно один повтор). */
async function withAuthRetry(auth: FiziklAuth, request: () => Promise<Response>): Promise<Response> {
  let res = await request();
  if (res.status === 401) {
    auth.invalidate();
    res = await request();
  }
  return res;
}

async function request(auth: FiziklAuth, method: string, url: string, body?: string): Promise<Response> {
  const access = await auth.getAccess();
  try {
    return await fetch(url, {
      method,
      headers: {
        Authorization: `Secret ${access}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body,
    });
  } catch (cause) {
    throw new FiziklApiError(`Нет связи с Физиклом (${new URL(url).host}).`, undefined, { cause });
  }
}

/** Не-2xx ответ → FiziklApiError с русским сообщением и detail из тела, если он есть. */
async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
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
