import { FIZIKL_URLS } from "../config.js";
import type { FiziklAuth } from "../fizikl/auth.js";
import { getJson } from "../fizikl/client.js";

interface Meal {
  id: number;
  name: string;
  slug: string;
  is_enable: boolean;
}

export async function listMeals(auth: FiziklAuth): Promise<string> {
  const meals = await getJson<Meal[]>(auth, `${FIZIKL_URLS.foodTracker}/api/v1/ration/meal/list/`);
  const enabled = meals.filter((meal) => meal.is_enable);
  if (enabled.length === 0) {
    return "Приёмы пищи не найдены — похоже, все выключены.";
  }
  const lines = enabled.map((meal) => `- ${meal.name} — slug: \`${meal.slug}\``);
  return ["Приёмы пищи (slug нужен при записи съеденного):", ...lines].join("\n");
}
