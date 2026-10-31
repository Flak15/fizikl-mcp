/**
 * Типы ответов API food-tracker (см. docs/research/food-tracker-swagger.json и
 * docs/research/pht-api.md). Формы сужены до полей, которыми пользуется сервер.
 */

/** Приём пищи из meal/list (swagger: Meal). */
export interface Meal {
  id: number;
  name: string;
  slug: string;
  is_enable: boolean;
}

/** Запись о съеденном из eaten-food/list (swagger: EatenFoodList): строка дневника с вложенными продуктом и порцией. */
export interface EatenFoodItem {
  id: number;
  /**
   * Slug приёма пищи. По swagger (EatenFoodList.meal) это ОБЯЗАТЕЛЬНАЯ СТРОКА
   * («Slug приема пищи», minLength 1), а не вложенный объект. В типе поле оставлено
   * опциональным: группировка в get_day_summary устойчива к отсутствию/пустоте.
   */
  meal?: string;
  serving_amount: number;
  food?: { name?: string } | null;
  serving?: { name?: string; metric_weight?: number } | null;
}
