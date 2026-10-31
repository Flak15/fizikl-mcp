/**
 * Ручной smoke-цикл на проде (ADR-0006, тикет 06): логин → поиск → карточка →
 * запись → проверка дня → удаление. НЕ автотест и не в CI: реальная сеть,
 * реальный дневник. Запуск: `npm run smoke`, креды — LOGIN/PASSWORD в `.env`
 * у корня проекта. Запись удаляется за собой (гарантия в finally); известное
 * последствие: дневной отчёт за дату прогона может сохранить значения дня теста.
 */

import { AUTH_FILE_PATH, FIZIKL_URLS, getCredentials, loadEnvFile } from "./config.js";
import { FiziklAuth } from "./fizikl/auth.js";
import { getJson } from "./fizikl/client.js";
import { deleteEatenFood } from "./tools/delete-eaten-food.js";
import { getDaySummary } from "./tools/get-day-summary.js";
import { fetchFoodCard, formatFoodCard, isGramServing } from "./tools/get-food.js";
import { listMeals } from "./tools/list-meals.js";
import { logFood, today } from "./tools/log-food.js";
import { searchFood } from "./tools/search-food.js";

const SEARCH_QUERY = "гречка";
const SEARCH_LIMIT = 3;
const GRAMS = 10;
const MEAL = "perekus"; // явный приём пищи, чтобы не зависеть от окна автоподбора
const TOTAL_STEPS = 8;

/** Минимальный вид записи eaten-food/list — для программной проверки id. */
interface EatenFoodRecord {
  id: number;
}

function step(n: number, title: string): void {
  console.log(`\n=== Шаг ${n}/${TOTAL_STEPS}. ${title} ===`);
}

/** Тот же эндпоинт, что внутри get_day_summary; нужен id записи для проверок. */
async function fetchEatenFoodRecords(auth: FiziklAuth, date: string): Promise<EatenFoodRecord[]> {
  return getJson<EatenFoodRecord[]>(
    auth,
    `${FIZIKL_URLS.foodTracker}/api/v1/ration/eaten-food/list/?eaten_date=${date}`,
  );
}

let createdId: number | null = null;
let cleanupDone = false;
/** Модульный уровень: аварийная очистка в finally должна иметь доступ к авторизации. */
let auth: FiziklAuth | null = null;

async function main(): Promise<void> {
  step(1, "Креды из .env");
  loadEnvFile();
  const credentials = getCredentials();
  console.log(
    `LOGIN задан (${credentials.login.length} симв.), PASSWORD задан (${credentials.password.length} симв.).`,
  );
  auth = new FiziklAuth({ credentials, authFilePath: AUTH_FILE_PATH });
  const date = today(new Date());

  step(2, "list_meals — первый вызов инструмента, ленивый логин");
  console.log(await listMeals(auth));

  step(3, `search_food «${SEARCH_QUERY}» (лимит ${SEARCH_LIMIT})`);
  const searchText = await searchFood(auth, SEARCH_QUERY, SEARCH_LIMIT);
  console.log(searchText);
  const idMatch = searchText.match(/id: (\d+)/);
  if (!idMatch) {
    throw new Error("search_food не вернул ни одного id продукта — продолжать не на чем.");
  }
  const foodId = idMatch[1];

  step(4, `get_food ${foodId} — ищем порцию «г» (metric_weight: 1)`);
  const card = await fetchFoodCard(auth, foodId);
  console.log(formatFoodCard(card));
  const gramServing = (card.food_servings ?? []).find(isGramServing);
  if (!gramServing) {
    throw new Error(
      `У продукта «${card.name}» (id: ${card.id}) нет порции «г» — записать «просто граммы» не выйдет.`,
    );
  }

  step(5, `log_food: ${GRAMS} г, приём пищи «${MEAL}», дата ${date}`);
  const logText = await logFood(auth, {
    servingId: gramServing.id,
    servingAmount: GRAMS,
    meal: MEAL,
    eatenDate: date,
  });
  console.log(logText);
  const recordMatch = logText.match(/id записи: (\d+)/);
  if (!recordMatch) {
    throw new Error("log_food не сообщил id записи — гарантированная очистка невозможна.");
  }
  createdId = Number(recordMatch[1]);
  console.log(`Создана запись ${createdId} — при любом сбое дальше она будет удалена.`);

  step(6, `get_day_summary за ${date} — запись должна быть видна`);
  console.log(await getDaySummary(auth, { date }));
  const records = await fetchEatenFoodRecords(auth, date);
  if (!records.some((record) => record.id === createdId)) {
    throw new Error(`Запись ${createdId} не найдена в eaten-food/list за ${date}.`);
  }
  console.log(`Проверка: запись ${createdId} видна в дневнике за ${date}.`);

  step(7, `delete_eaten_food(${createdId})`);
  console.log(await deleteEatenFood(auth, createdId));
  cleanupDone = true;

  step(8, "повторная проверка — записи в дневнике больше нет");
  const after = await fetchEatenFoodRecords(auth, date);
  if (after.some((record) => record.id === createdId)) {
    throw new Error(`Запись ${createdId} всё ещё в дневнике за ${date} после удаления!`);
  }
  console.log(`Проверка: записи ${createdId} за ${date} в дневнике больше нет.`);

  console.log("\nSmoke пройден: поиск → карточка → запись → проверка дня → удаление, дневник чист.");
  console.log(
    "Примечание (ADR-0006): дневной отчёт за дату прогона может сохранить значения дня теста.",
  );
}

try {
  await main();
} catch (error) {
  console.error(`\n✗ SMOKE ПРОВАЛЕН: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (createdId !== null && auth !== null && !cleanupDone) {
    console.error(`\nАварийная очистка: запись ${createdId} могла остаться в дневнике, удаляю…`);
    try {
      console.error(await deleteEatenFood(auth, createdId));
      console.error("Аварийная очистка завершена — дневник чист.");
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      if (message.includes("не найдена")) {
        console.error("Записи уже нет — дневник чист.");
      } else {
        console.error(`Не удалось удалить запись ${createdId}: ${message}`);
        console.error(`Удалите её вручную через delete_eaten_food(${createdId}).`);
        process.exitCode = 1;
      }
    }
  }
}
