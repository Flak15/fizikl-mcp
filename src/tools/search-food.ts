import { FIZIKL_URLS } from "../config.js";
import type { FiziklAuth } from "../fizikl/auth.js";
import { getJson } from "../fizikl/client.js";
import { fetchFoodCard, formatServingLabel, type FoodCard } from "./get-food.js";

/** Максимум карточек за один поиск (ADR-0004: гидратация топ-N, N ≤ 10). */
export const MAX_SEARCH_LIMIT = 10;

/**
 * search v1 отдаёт только ID продуктов, поэтому — единственное отступление от
 * «тонкой обёртки» (ADR-0004) — докупаем карточки топ-N результатов, чтобы LLM
 * не делала до 10 вызовов get_food на каждый поиск.
 */
export async function searchFood(auth: FiziklAuth, query: string, limit = MAX_SEARCH_LIMIT): Promise<string> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
    throw new Error(`Лимит должен быть целым числом от 1 до ${MAX_SEARCH_LIMIT}, получено: ${limit}.`);
  }
  const params = new URLSearchParams({ query, page_size: String(limit), page: "1", is_base: "false" });
  const ids = await getJson<string[]>(auth, `${FIZIKL_URLS.search}/api/v1/search/food/?${params.toString()}`);
  if (ids.length === 0) {
    return `По запросу «${query}» ничего не найдено. Попробуйте другое название (например, «гречка», «творог 5%»).`;
  }
  const cards: FoodCard[] = [];
  for (const id of ids.slice(0, limit)) {
    cards.push(await fetchFoodCard(auth, id));
  }
  const header = `По запросу «${query}» найдено продуктов: ${ids.length}. Показаны топ-${cards.length} (лимит ${limit}).`;
  const blocks = cards.map((card, index) => formatCardShort(card, index + 1));
  const footer = "Нужны КБЖУ порций и id порций — get_food(<id продукта>).";
  return [header, ...blocks, footer].join("\n\n");
}

/** Компактная карточка для выдачи поиска: название, id, порции с подсвеченной порцией «г». */
function formatCardShort(card: FoodCard, position: number): string {
  const servings = card.food_servings ?? [];
  const portions = servings.length > 0 ? servings.map(formatServingLabel).join(", ") : "нет";
  return `${position}. ${card.name} (id: ${card.id})\n   Порции: ${portions}`;
}
