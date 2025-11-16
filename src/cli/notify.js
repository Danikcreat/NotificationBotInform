import { Telegraf } from "telegraf";
import config from "../config.js";
import logger from "../logger.js";
import ApiClient from "../apiClient.js";
import { UserDirectory } from "../userDirectory.js";

function parseArgs(argv) {
  const args = { message: null, logins: [], help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--message" || arg === "-m") {
      const parts = [];
      let cursor = i + 1;
      while (cursor < argv.length) {
        const value = argv[cursor];
        if (typeof value === "string" && value.startsWith("--")) {
          break;
        }
        parts.push(value);
        cursor += 1;
      }
      args.message = parts.length ? parts.join(" ") : null;
      i = cursor - 1;
    } else if (arg === "--login" || arg === "-l") {
      const login = argv[i + 1];
      if (login) {
        args.logins.push(login);
        i += 1;
      }
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printUsage() {
  console.log("Usage: npm run notify -- --message \"text\" [--login user1 --login user2]");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }
  if (!args.message) {
    printUsage();
    process.exit(1);
  }

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

  const optedInUsers = userDirectory.getOptedInUsers();
  const loginFilter = args.logins.map((login) => login.trim().toLowerCase());
  const recipients = loginFilter.length
    ? optedInUsers.filter((user) => loginFilter.includes(String(user.login || "").toLowerCase()))
    : optedInUsers;

  if (!recipients.length) {
    logger.warn("No recipients matched the provided filters.");
    return;
  }

  const bot = new Telegraf(config.telegramBotToken);
  let sent = 0;
  for (const user of recipients) {
    try {
      await bot.telegram.sendMessage(user.telegramChatId, args.message);
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
}

main().catch((error) => {
  logger.error({ err: error }, "Broadcast failed");
  process.exit(1);
});
