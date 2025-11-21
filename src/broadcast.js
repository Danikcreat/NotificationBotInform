import { Telegraf } from "telegraf";
import config from "./config.js";
import logger from "./logger.js";
import ApiClient from "./apiClient.js";
import { UserDirectory } from "./userDirectory.js";

async function buildUserDirectory() {
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
  await userDirectory.refresh(true);
  return { apiClient, userDirectory };
}

export async function sendBroadcast({ message, logins = [] }) {
  const text = String(message || "").trim();
  if (!text) {
    const error = new Error("Broadcast message is required");
    error.status = 400;
    throw error;
  }
  const loginFilter = Array.isArray(logins)
    ? logins
        .map((login) => (typeof login === "string" ? login.trim().toLowerCase() : ""))
        .filter(Boolean)
    : [];

  const { userDirectory } = await buildUserDirectory();
  const optedInUsers = userDirectory.getOptedInUsers();
  const recipients = loginFilter.length
    ? optedInUsers.filter((user) => loginFilter.includes(String(user.login || "").toLowerCase()))
    : optedInUsers;

  if (!recipients.length) {
    logger.warn("No recipients matched the provided filters.");
    return { sent: 0, total: 0 };
  }

  const bot = new Telegraf(config.telegramBotToken);
  let sent = 0;
  for (const user of recipients) {
    try {
      await bot.telegram.sendMessage(user.telegramChatId, text);
      logger.info({ login: user.login }, "Broadcast delivered");
      sent += 1;
      if (config.broadcastBatchSize > 0 && sent % config.broadcastBatchSize === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error({ err: error, login: user.login }, "Failed to send broadcast");
    }
  }
  logger.info({ sent, total: recipients.length }, "Broadcast finished");
  return { sent, total: recipients.length };
}
