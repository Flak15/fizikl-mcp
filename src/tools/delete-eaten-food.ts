import { FIZIKL_URLS } from "../config.js";
import type { FiziklAuth } from "../fizikl/auth.js";
import { deleteResource, FiziklApiError } from "../fizikl/client.js";

/** Удаление записи о съеденном из дневника по её id. */
export async function deleteEatenFood(auth: FiziklAuth, id: number): Promise<string> {
  try {
    await deleteResource(auth, `${FIZIKL_URLS.foodTracker}/api/v1/ration/eaten-food/destroy/${id}/`);
  } catch (error) {
    // Повторное удаление — обычная ситуация, а не сбой: объясняем по-русски.
    if (error instanceof FiziklApiError && error.status === 404) {
      throw new Error(`Запись ${id} не найдена — возможно, она уже удалена.`);
    }
    throw error;
  }
  return `Запись ${id} удалена из дневника.`;
}
