import { Telegraf } from "telegraf";
import config from "./config.js";
import logger from "./logger.js";
import ApiClient from "./apiClient.js";
import { UserDirectory } from "./userDirectory.js";
import StateStore from "./stateStore.js";
import TaskNotifier from "./notifier.js";
import { buildTaskSummary, tasksForLogin } from "./tasks.js";

async function main() {
  const apiClient = new ApiClient({
    baseUrl: config.apiBaseUrl,
    apiToken: config.apiToken,
    serviceLogin: config.serviceLogin,
    servicePassword: config.servicePassword,
    logger,
  });
  const userDirectory = new UserDirectory({
    apiClient,
    logger,
    refreshIntervalMs: config.userRefreshIntervalMs,
  });
  const stateStore = new StateStore(config.stateFilePath, logger);
  await stateStore.init();

  const bot = new Telegraf(config.telegramBotToken);
  registerHandlers(bot, userDirectory, apiClient);

  const notifier = new TaskNotifier({
    apiClient,
    userDirectory,
    bot,
    stateStore,
    logger,
    pollIntervalMs: config.notifierPollIntervalMs,
    deadlineWindowHours: config.deadlineAlertWindowHours,
    taskUrlTemplate: config.taskUrlTemplate,
  });

  bot.catch((err) => {
    logger.error({ err }, "Telegram bot error");
  });

  await userDirectory.refresh(true);
  await bot.launch();
  notifier.start();

  logger.info("Telegram bot is up and running");

  const stop = async () => {
    notifier.stop();
    await bot.stop();
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

function registerHandlers(bot, userDirectory, apiClient) {
  bot.start(async (ctx) => {
    const username = ctx.from?.username;
    if (!username) {
      await ctx.reply(
        "У вас не заполнен username в Telegram. Установите его в настройках и повторите /start."
      );
      return;
    }
    try {
      const result = await userDirectory.syncTelegramLink({
        username,
        chatId: ctx.chat.id,
        optIn: true,
      });
      if (result.status === "linked" || result.status === "already_linked") {
        await ctx.reply(
          "Связь с аккаунтом подтверждена. Я буду присылать вам напоминания по задачам. Команда /tasks покажет ваши текущие задачи."
        );
      } else if (result.status === "not_found") {
        await ctx.reply(
          `Не нашёл пользователя с логином ${username}. Убедитесь, что логин в приложении совпадает с Telegram username.`
        );
      } else {
        await ctx.reply("Не удалось обновить Telegram данные. Попробуйте позже.");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to link Telegram chat");
      await ctx.reply("Произошла ошибка при привязке. Повторите попытку позже.");
    }
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "Доступные команды:",
        "/start — привязать аккаунт и включить уведомления",
        "/tasks — показать задачи, где вы указаны ответственным",
        "/stop — отключить уведомления",
        "/help — эта подсказка",
      ].join("\n")
    );
  });

  bot.command("tasks", async (ctx) => {
    try {
      const user =
        userDirectory.getUserByChatId(ctx.chat.id) || userDirectory.getUserByLogin(ctx.from?.username);
      if (!user) {
        await ctx.reply("Не удалось определить пользователя. Отправьте /start для привязки.");
        return;
      }
      const tasks = await apiClient.getTasks();
      const myTasks = tasksForLogin(tasks, user.login);
      if (!myTasks.length) {
        await ctx.reply("На вас пока нет задач. Хорошего дня!");
        return;
      }
      const message = ["Ваши задачи:", ""].concat(myTasks.map((task) => buildTaskSummary(task))).join("\n");
      await sendChunkedMessage(ctx, message);
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch tasks for user");
      await ctx.reply("Не удалось загрузить задачи. Попробуйте позже.");
    }
  });

  bot.command("stop", async (ctx) => {
    try {
      const result = await userDirectory.optOutByChatId(ctx.chat.id);
      if (result.status === "opted_out") {
        await ctx.reply("Уведомления отключены. Чтобы вернуться — отправьте /start.");
      } else {
        await ctx.reply("У вас и так не было активных уведомлений.");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to disable notifications");
      await ctx.reply("Не удалось отключить уведомления. Попробуйте позже.");
    }
  });

  bot.on("text", async (ctx) => {
    const text = ctx.message?.text || "";
    if (text.trim().startsWith("/")) {
      return;
    }
    await ctx.reply("Я понимаю команды /start, /tasks, /stop и /help.");
  });
}

async function sendChunkedMessage(ctx, text, chunkSize = 3500) {
  let buffer = "";
  const flush = async () => {
    if (buffer.trim()) {
      await ctx.reply(buffer);
    }
    buffer = "";
  };

  for (const line of text.split("\n")) {
    const candidate = buffer ? `${buffer}\n${line}` : line;
    if (candidate.length > chunkSize && buffer) {
      await flush();
      buffer = line;
      continue;
    }
    buffer = candidate;
  }

  if (buffer) {
    await flush();
  }
}

main().catch((error) => {
  logger.error({ err: error }, "Bot failed to start");
  process.exit(1);
});
