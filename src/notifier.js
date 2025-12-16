import { formatDeadline, isDeadlineOnDate, isDeadlineWithinWindow, parseDeadline } from "./tasks.js";

export default class TaskNotifier {
  constructor({
    apiClient,
    userDirectory,
    bot,
    stateStore,
    logger,
    pollIntervalMs,
    deadlineWindowHours,
    taskUrlTemplate,
    dailyReminderHour,
    dailyReminderMinute,
  }) {
    this.apiClient = apiClient;
    this.userDirectory = userDirectory;
    this.bot = bot;
    this.stateStore = stateStore;
    this.logger = logger;
    this.pollIntervalMs = pollIntervalMs;
    this.deadlineWindowHours = deadlineWindowHours;
    this.taskUrlTemplate = taskUrlTemplate;
    this.dailyReminderHour = this.normalizeHourValue(dailyReminderHour);
    this.dailyReminderMinute = this.normalizeMinuteValue(dailyReminderMinute);
    this.timer = null;
    this.activeTick = null;
  }

  start() {
    if (!this.pollIntervalMs || this.pollIntervalMs <= 0) {
      this.logger?.info("Task notifier is disabled (interval is 0)");
      return;
    }
    this.logger?.info(
      { intervalMs: this.pollIntervalMs, windowHours: this.deadlineWindowHours },
      "Task notifier started"
    );
    this.tick();
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.activeTick) return this.activeTick;
    this.activeTick = this.processTick().finally(() => {
      this.activeTick = null;
    });
    return this.activeTick;
  }

  async processTick() {
    try {
      await this.userDirectory.refresh();
      const tasks = await this.apiClient.getTasks();
      const now = new Date();
      await this.maybeSendDailyReminders(tasks, now);
      for (const task of tasks) {
        await this.handleTask(task, now);
      }
    } catch (error) {
      this.logger?.error({ err: error }, "Task notifier tick failed");
    }
  }

  async handleTask(task, now) {
    if (!task?.deadline) return;
    const deadline = parseDeadline(task.deadline);
    if (!deadline) return;
    if (!isDeadlineWithinWindow(deadline, this.deadlineWindowHours, now)) {
      return;
    }
    const responsibleLogin = task.responsible;
    if (!responsibleLogin) return;
    const user = this.userDirectory.getUserByLogin(responsibleLogin);
    if (!user || !user.telegramOptIn || !user.telegramChatId) {
      return;
    }
    const deadlineIso = deadline.toISOString();
    if (this.stateStore.wasDeadlineNotified(task.id, deadlineIso)) {
      return;
    }
    const message = this.composeDeadlineMessage(task, deadline);
    try {
      await this.bot.telegram.sendMessage(user.telegramChatId, message);
      await this.stateStore.markDeadlineNotified(task.id, deadlineIso);
      this.logger?.info(
        { taskId: task.id, login: user.login, deadline: deadlineIso },
        "Deadline notification sent"
      );
    } catch (error) {
      this.logger?.error(
        { err: error, taskId: task.id, login: user.login },
        "Failed to send Telegram notification"
      );
    }
  }

  async maybeSendDailyReminders(tasks, now) {
    if (!this.isDailyReminderEnabled()) return;
    if (!this.hasReachedDailyReminderTime(now)) return;
    const dateKey = this.buildDateKey(now);
    if (this.stateStore.wasDailyReminderSent(dateKey)) {
      return;
    }
    const recipients = this.collectDailyReminderRecipients(tasks, now);
    if (!recipients.length) {
      await this.stateStore.markDailyReminderSent(dateKey);
      this.logger?.info({ date: dateKey }, "Daily reminders skipped (no deadlines today)");
      return;
    }
    for (const recipient of recipients) {
      const message = this.composeDailyReminderMessage(recipient.tasks, now);
      try {
        await this.bot.telegram.sendMessage(recipient.user.telegramChatId, message);
      } catch (error) {
        this.logger?.error(
          { err: error, login: recipient.user.login },
          "Failed to send daily reminder"
        );
      }
    }
    await this.stateStore.markDailyReminderSent(dateKey);
    this.logger?.info(
      { date: dateKey, recipients: recipients.length },
      "Daily deadline reminders sent"
    );
  }

  collectDailyReminderRecipients(allTasks, now) {
    if (!Array.isArray(allTasks) || !allTasks.length) {
      return [];
    }
    const grouped = new Map();
    for (const task of allTasks) {
      if (!task?.deadline || !isDeadlineOnDate(task.deadline, now)) {
        continue;
      }
      const loginKey = String(task.responsible || "").trim().toLowerCase();
      if (!loginKey) continue;
      if (!grouped.has(loginKey)) {
        grouped.set(loginKey, []);
      }
      grouped.get(loginKey).push(task);
    }
    const recipients = [];
    for (const [loginKey, tasks] of grouped.entries()) {
      const user = this.userDirectory.getUserByLogin(loginKey);
      if (!user || !user.telegramOptIn || !user.telegramChatId) {
        continue;
      }
      recipients.push({ user, tasks });
    }
    return recipients;
  }

  composeDailyReminderMessage(tasks, now = new Date()) {
    const sorted = [...tasks].sort((a, b) => {
      const left = parseDeadline(a.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const right = parseDeadline(b.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    });
    const lines = [];
    lines.push("Привет!");
    lines.push("У тебя сегодня дедлайн по задачам:");
    lines.push("");
    sorted.forEach((task, index) => {
      const title = task.title || "Без названия";
      lines.push(`${index + 1}. ${title}`);
      lines.push(`   Дедлайн: ${formatDeadline(task.deadline, now)}`);
      const taskUrl = this.buildTaskUrl(task.id);
      if (taskUrl) {
        lines.push(`   ${taskUrl}`);
      }
    });
    return lines.join("\n");
  }

  isDailyReminderEnabled() {
    return Number.isInteger(this.dailyReminderHour) && this.dailyReminderHour >= 0 && this.dailyReminderHour <= 23;
  }

  hasReachedDailyReminderTime(now) {
    if (!this.isDailyReminderEnabled()) {
      return false;
    }
    const minute = Number.isInteger(this.dailyReminderMinute) ? this.dailyReminderMinute : 0;
    const target = new Date(now);
    target.setHours(this.dailyReminderHour, minute, 0, 0);
    return now.getTime() >= target.getTime();
  }

  buildDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  normalizeHourValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return null;
    }
    const normalized = Math.trunc(number);
    if (normalized < 0 || normalized > 23) {
      return null;
    }
    return normalized;
  }

  normalizeMinuteValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    const normalized = Math.trunc(number);
    if (normalized < 0 || normalized > 59) {
      return 0;
    }
    return normalized;
  }

  composeDeadlineMessage(task, deadline) {
    const lines = [];
    lines.push("⚠️ Напоминание о задаче");
    lines.push(`Название: ${task.title || "Без названия"}`);
    lines.push(`Дедлайн: ${formatDeadline(deadline)}`);
    if (task.status) {
      lines.push(`Статус: ${task.status}`);
    }
    if (task.priority) {
      lines.push(`Приоритет: ${task.priority}`);
    }
    const taskUrl = this.buildTaskUrl(task.id);
    if (taskUrl) {
      lines.push(`Ссылка: ${taskUrl}`);
    }
    lines.push("");
    return lines.join("\n");
  }

  buildTaskUrl(taskId) {
    if (!this.taskUrlTemplate || !taskId) return null;
    return this.taskUrlTemplate.replace(":id", encodeURIComponent(taskId));
  }
}
