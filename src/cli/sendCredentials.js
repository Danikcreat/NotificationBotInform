import { Telegraf } from "telegraf";
import config from "../config.js";
import logger from "../logger.js";
import ApiClient from "../apiClient.js";
import { broadcastCredentials, buildUserDirectory } from "../credentialBroadcaster.js";

async function sendCredentialsBroadcast() {
  const apiClient = new ApiClient({
    baseUrl: config.apiBaseUrl,
    apiToken: config.apiToken,
    serviceLogin: config.serviceLogin,
    servicePassword: config.servicePassword,
    logger,
  });
  const userDirectory = buildUserDirectory(apiClient, logger, config.userRefreshIntervalMs);
  await userDirectory.refresh(true);

  const bot = new Telegraf(config.telegramBotToken);
  await broadcastCredentials({
    bot,
    userDirectory,
    logger,
    batchSize: config.broadcastBatchSize,
    forceRefresh: false,
  });
}

sendCredentialsBroadcast().catch((error) => {
  logger.error({ err: error }, "Credential broadcast failed");
  process.exit(1);
});
