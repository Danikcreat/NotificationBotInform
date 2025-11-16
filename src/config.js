import dotenv from "dotenv";
import path from "path";
import process from "process";

dotenv.config();

function readEnv(name, { required = false, defaultValue = undefined } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    if (required) {
      throw new Error(`Environment variable ${name} is required`);
    }
    return defaultValue;
  }
  return raw.trim();
}

function readNumberEnv(name, defaultValue) {
  const raw = readEnv(name);
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return parsed;
}

const config = Object.freeze({
  telegramBotToken: readEnv("TELEGRAM_BOT_TOKEN", { required: true }),
  apiBaseUrl: readEnv("API_BASE_URL", { defaultValue: "http://localhost:4000/api" }),
  apiToken: readEnv("API_TOKEN"),
  serviceLogin: readEnv("API_SERVICE_LOGIN"),
  servicePassword: readEnv("API_SERVICE_PASSWORD"),
  userRefreshIntervalMs: readNumberEnv("USER_REFRESH_INTERVAL_MS", 5 * 60 * 1000),
  notifierPollIntervalMs: readNumberEnv("TASK_NOTIFIER_POLL_INTERVAL_MS", 60 * 1000),
  deadlineAlertWindowHours: readNumberEnv("TASK_DEADLINE_ALERT_WINDOW_HOURS", 24),
  stateFilePath: path.resolve(
    readEnv("TASK_NOTIFIER_STATE_PATH", { defaultValue: path.join(process.cwd(), "bot-state.json") })
  ),
  broadcastBatchSize: readNumberEnv("BROADCAST_BATCH_SIZE", 20),
  taskUrlTemplate: readEnv("TASK_URL_TEMPLATE"),
});

export default config;
