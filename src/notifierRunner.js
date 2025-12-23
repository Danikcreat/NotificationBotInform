import { Telegraf } from "telegraf";
import config from "./config.js";
import logger from "./logger.js";
import ApiClient from "./apiClient.js";
import { UserDirectory } from "./userDirectory.js";
import StateStore from "./stateStore.js";
import TaskNotifier from "./notifier.js";

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
  await userDirectory.refresh(true);

  const botClient = new Telegraf(config.telegramBotToken);

  const notifier = new TaskNotifier({
    apiClient,
    userDirectory,
    bot: botClient,
    stateStore,
    logger,
    pollIntervalMs: config.notifierPollIntervalMs,
    deadlineWindowHours: config.deadlineAlertWindowHours,
    taskUrlTemplate: config.taskUrlTemplate,
    dailyReminderHour: config.dailyReminderHour,
    dailyReminderMinute: config.dailyReminderMinute,
  });

  notifier.start();
  logger.info("Standalone task notifier started");

  const stop = async () => {
    notifier.stop();
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error) => {
  logger.error({ err: error }, "Notifier runner failed to start");
  process.exit(1);
});
