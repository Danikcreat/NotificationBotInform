import { formatDeadline, isDeadlineWithinWindow, parseDeadline } from "./tasks.js";

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
  }) {
    this.apiClient = apiClient;
    this.userDirectory = userDirectory;
    this.bot = bot;
    this.stateStore = stateStore;
    this.logger = logger;
    this.pollIntervalMs = pollIntervalMs;
    this.deadlineWindowHours = deadlineWindowHours;
    this.taskUrlTemplate = taskUrlTemplate;
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
    lines.push("Чтобы отключить уведомления отправьте /stop");
    return lines.join("\n");
  }

  buildTaskUrl(taskId) {
    if (!this.taskUrlTemplate || !taskId) return null;
    return this.taskUrlTemplate.replace(":id", encodeURIComponent(taskId));
  }
}
