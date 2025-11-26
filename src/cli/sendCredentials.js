import { Telegraf } from "telegraf";
import config from "../config.js";
import logger from "../logger.js";
import ApiClient from "../apiClient.js";
import { broadcastCredentials, buildUserDirectory } from "../credentialBroadcaster.js";

function parseArgs(argv) {
  const args = { logins: [], help: false, sendAll: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--login" || arg === "-l") {
      const login = argv[i + 1];
      if (login) {
        args.logins.push(login);
        i += 1;
      }
    } else if (arg.startsWith("--login=")) {
      const login = arg.split("=").slice(1).join("=");
      if (login) {
        args.logins.push(login);
      }
    } else if (arg.startsWith("-l") && arg.length > 2) {
      const login = arg.slice(2);
      if (login) {
        args.logins.push(login);
      }
    } else if (arg === "--all" || arg === "-a") {
      args.sendAll = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (!arg.startsWith("-")) {
      args.logins.push(arg);
    }
  }
  const npmConfigLogin = process.env.npm_config_login;
  if (npmConfigLogin && npmConfigLogin !== "true" && !args.logins.includes(npmConfigLogin)) {
    args.logins.push(npmConfigLogin);
  }
  return args;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run broadcast-credentials -- --login user1 --login user2",
      "  npm run broadcast-credentials -- --all",
      "Repeat --login for every recipient. Without --all the broadcast targets only the provided logins.",
    ].join("\n")
  );
}

async function sendCredentialsBroadcast({ logins = [] } = {}) {
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
    logins,
  });
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}
if (!args.sendAll && args.logins.length === 0) {
  console.error("No logins provided. Add at least one --login or run with --all.");
  printUsage();
  process.exit(1);
}

const targetLogins = args.sendAll ? [] : args.logins;
logger.info(
  {
    requestedLogins: targetLogins,
    mode: args.sendAll ? "all" : "filtered",
  },
  "Starting credential broadcast via CLI"
);

sendCredentialsBroadcast({ logins: targetLogins })
  .catch((error) => {
    logger.error({ err: error }, "Credential broadcast failed");
    process.exit(1);
  });
