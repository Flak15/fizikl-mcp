import { FIZIKL_URLS } from "../config.js";
import type { FiziklAuth } from "../fizikl/auth.js";
import { getJson } from "../fizikl/client.js";
import { fmtNum } from "./format.js";

export interface FoodServing {
  id: number;
  name: string;
  metric_weight: number;
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  is_default?: boolean;
}

export interface FoodCard {
  id: number;
  name: string;
  brand_name?: string | null;
  is_base?: boolean;
  category?: { id: number; name: string } | null;
  default_serving?: { id: number; serving_amount: number } | null;
  food_servings?: FoodServing[];
  cooking_coefficient?: number | string | null;
}

/** GET карточки продукта из food-tracker. Отдельная функция — search_food гидратирует ею топ-N результатов. */
export async function fetchFoodCard(auth: FiziklAuth, id: string): Promise<FoodCard> {
  return getJson<FoodCard>(auth, `${FIZIKL_URLS.foodTracker}/api/v1/food/${id}/`);
}

/** Порция «г» с metric_weight: 1 — способ записать «просто граммы» (см. GLOSSARY.md). */
export function isGramServing(serving: FoodServing): boolean {
  return serving.name === "г" && serving.metric_weight === 1;
}

export async function getFood(auth: FiziklAuth, id: string | number): Promise<string> {
  const raw = String(id).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`id продукта должен быть числом (возьмите его из search_food), получено: «${String(id)}».`);
  }
  const card = await fetchFoodCard(auth, raw);
  return formatFoodCard(card);
}

/** Человекочитаемая карточка: порции с id и metric_weight, КБЖУ порций, cooking_coefficient. */
export function formatFoodCard(card: FoodCard): string {
  const lines: string[] = [`${card.name} (id: ${card.id})`];
  if (card.brand_name) lines.push(`Бренд: ${card.brand_name}`);
  if (card.category?.name) lines.push(`Категория: ${card.category.name}`);
  if (card.cooking_coefficient !== null && card.cooking_coefficient !== undefined) {
    lines.push(`Коэффициент варки (cooking_coefficient): ${card.cooking_coefficient}`);
  }
  const servings = card.food_servings ?? [];
  if (servings.length === 0) {
    lines.push("Порции: не найдены.");
    return lines.join("\n");
  }
  lines.push("Порции:");
  for (const serving of servings) {
    lines.push(`- id ${serving.id} ${formatServingLabel(serving)}${formatNutrition(serving)}`);
  }
  return lines.join("\n");
}

export function formatServingLabel(serving: FoodServing): string {
  const weight = formatWeight(serving.metric_weight);
  if (isGramServing(serving)) {
    return `«${serving.name}» — ${weight} — просто граммы (serving_amount = вес в граммах)`;
  }
  return `«${serving.name}» — ${weight}`;
}

function formatWeight(metricWeight: number): string {
  return `${Number(metricWeight.toFixed(2))} г`;
}

function formatNutrition(serving: FoodServing): string {
  if (typeof serving.calories !== "number") return "";
  const parts = [`${fmtNum(serving.calories)} ккал`];
  if (typeof serving.protein === "number") parts.push(`Б ${fmtNum(serving.protein)}`);
  if (typeof serving.fat === "number") parts.push(`Ж ${fmtNum(serving.fat)}`);
  if (typeof serving.carbohydrate === "number") parts.push(`У ${fmtNum(serving.carbohydrate)}`);
  return `; КБЖУ на порцию: ${parts.join(", ")}`;
}
