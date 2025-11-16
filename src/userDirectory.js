function normalizeLogin(login) {
  return String(login || "")
    .trim()
    .toLowerCase();
}

function normalizeChatId(chatId) {
  if (chatId === undefined || chatId === null) return null;
  const value = String(chatId || "").trim();
  return value || null;
}

export class UserDirectory {
  constructor({ apiClient, logger, refreshIntervalMs = 5 * 60 * 1000 }) {
    this.apiClient = apiClient;
    this.logger = logger;
    this.refreshIntervalMs = refreshIntervalMs;
    this.usersById = new Map();
    this.loginIndex = new Map();
    this.chatIdIndex = new Map();
    this.lastRefreshAt = 0;
    this.refreshPromise = null;
  }

  async refresh(force = false) {
    const now = Date.now();
    if (!force && this.lastRefreshAt + this.refreshIntervalMs > now) {
      return this.getAllUsers();
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.apiClient
      .getUsers()
      .then((users) => {
        this.rebuildIndexes(users);
        return users;
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  rebuildIndexes(users) {
    this.usersById.clear();
    this.loginIndex.clear();
    this.chatIdIndex.clear();
    for (const user of users) {
      this.updateCache(user, { skipPreviousCleanup: true });
    }
    this.lastRefreshAt = Date.now();
  }

  updateCache(user, { skipPreviousCleanup = false } = {}) {
    if (!user) return;
    const id = String(user.id);
    if (!skipPreviousCleanup) {
      const previous = this.usersById.get(id);
      if (previous) {
        const prevLogin = normalizeLogin(previous.login);
        if (prevLogin) {
          const existing = this.loginIndex.get(prevLogin);
          if (existing && String(existing.id) === id) {
            this.loginIndex.delete(prevLogin);
          }
        }
        const prevChat = normalizeChatId(previous.telegramChatId);
        if (prevChat) {
          const existing = this.chatIdIndex.get(prevChat);
          if (existing && String(existing.id) === id) {
            this.chatIdIndex.delete(prevChat);
          }
        }
      }
    }

    this.usersById.set(id, user);
    const loginKey = normalizeLogin(user.login);
    if (loginKey) {
      this.loginIndex.set(loginKey, user);
    }
    const chatKey = normalizeChatId(user.telegramChatId);
    if (chatKey) {
      this.chatIdIndex.set(chatKey, user);
    }
  }

  getAllUsers() {
    return Array.from(this.usersById.values());
  }

  getUserByLogin(login) {
    const key = normalizeLogin(login);
    if (!key) return null;
    return this.loginIndex.get(key) || null;
  }

  getUserByChatId(chatId) {
    const key = normalizeChatId(chatId);
    if (!key) return null;
    return this.chatIdIndex.get(key) || null;
  }

  getOptedInUsers() {
    return this.getAllUsers().filter(
      (user) => Boolean(user.telegramOptIn) && Boolean(normalizeChatId(user.telegramChatId))
    );
  }

  async syncTelegramLink({ username, chatId, optIn = true }) {
    const loginKey = normalizeLogin(username);
    if (!loginKey) {
      return { status: "invalid_username" };
    }
    await this.refresh(true);
    const user = this.getUserByLogin(loginKey);
    if (!user) {
      return { status: "not_found" };
    }
    const payload = {};
    const chatIdValue = normalizeChatId(chatId);
    if (chatIdValue === null) {
      return { status: "invalid_chat" };
    }
    if (user.telegramUsername !== username) {
      payload.username = username;
    }
    if (user.telegramChatId !== chatIdValue) {
      payload.chatId = chatIdValue;
    }
    if (optIn && !user.telegramOptIn) {
      payload.optIn = true;
    }
    if (Object.keys(payload).length === 0) {
      return { status: "already_linked", user };
    }
    const updatedUser = await this.apiClient.updateUserTelegram(user.id, payload);
    this.updateCache(updatedUser);
    this.logger?.info({ login: user.login }, "Telegram chat linked");
    return { status: "linked", user: updatedUser };
  }

  async optOutByChatId(chatId) {
    const user = this.getUserByChatId(chatId);
    if (!user) {
      return { status: "not_linked" };
    }
    const payload = {};
    if (user.telegramChatId) {
      payload.chatId = null;
    }
    if (user.telegramOptIn) {
      payload.optIn = false;
    }
    if (Object.keys(payload).length === 0) {
      return { status: "already_disabled" };
    }
    const updatedUser = await this.apiClient.updateUserTelegram(user.id, payload);
    this.updateCache(updatedUser);
    this.logger?.info({ login: user.login }, "Telegram notifications disabled");
    return { status: "opted_out", user: updatedUser };
  }
}
