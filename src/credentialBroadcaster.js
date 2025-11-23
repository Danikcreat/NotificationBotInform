import { UserDirectory } from "./userDirectory.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCredentialMessage(login, password) {
  const escapedLogin = escapeHtml(login);
  const escapedPassword = escapeHtml(password);
  return [
    "<b>‼️ Системное уведомление</b>",
    "",
    "Вот твои секретные данные для входа в нашу систему. Сохрани или закрепи это сообщение.",
    "",
    `<b>Логин:</b> ${escapedLogin}`,
    `<b>Пароль:</b> <tg-spoiler>${escapedPassword}</tg-spoiler>`,
    "",
    "Удачной работы! По вопросам пиши администратору 🤖",
  ].join("\n");
}

export async function broadcastCredentials({
  bot,
  userDirectory,
  logger,
  batchSize = 20,
  forceRefresh = true,
}) {
  if (!(userDirectory instanceof UserDirectory)) {
    throw new Error("broadcastCredentials requires an instance of UserDirectory");
  }
  if (forceRefresh) {
    await userDirectory.refresh(true);
  }
  const recipients = userDirectory.getOptedInUsers();
  if (!recipients.length) {
    logger?.warn("No Telegram users opted in — skipping credentials broadcast");
    return { sent: 0, skipped: 0, total: 0 };
  }

  let sent = 0;
  let skipped = 0;

  for (const user of recipients) {
    const login = user.login ? String(user.login).trim() : "";
    const password = user.password ? String(user.password).trim() : "";
    const chatId = user.telegramChatId ? String(user.telegramChatId).trim() : "";
    if (!login || !password || !chatId) {
      skipped += 1;
      logger?.warn(
        {
          login: user.login,
          hasLogin: Boolean(login),
          hasPassword: Boolean(password),
          hasChatId: Boolean(chatId),
        },
        "Skipping user without login, password or chat id"
      );
      continue;
    }
    const message = buildCredentialMessage(login, password);
    try {
      await bot.telegram.sendMessage(chatId, message, { parse_mode: "HTML" });
      logger?.info({ login: user.login }, "Credentials delivered");
      sent += 1;
      if (batchSize > 0 && sent % batchSize === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger?.error({ err: error, login: user.login }, "Failed to send credentials");
    }
  }

  const total = recipients.length;
  logger?.info({ sent, skipped, total }, "Credential broadcast finished");
  return { sent, skipped, total };
}

export function buildUserDirectory(apiClient, logger, refreshIntervalMs) {
  return new UserDirectory({
    apiClient,
    logger,
    refreshIntervalMs,
  });
}
