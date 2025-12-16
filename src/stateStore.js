import { promises as fs } from "fs";
import path from "path";

export default class StateStore {
  constructor(filePath, logger) {
    this.filePath = filePath;
    this.logger = logger;
    this.state = {
      deadlineReminders: {},
      lastDailyReminderDate: null,
    };
    this.ready = false;
  }

  async init() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw);
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.logger?.warn({ err: error }, "Failed to read notifier state, starting from scratch");
      }
      this.state = {
        deadlineReminders: {},
        lastDailyReminderDate: null,
      };
      await this.persist();
    }
    this.normalizeState();
    this.ready = true;
  }

  normalizeState() {
    if (!this.state || typeof this.state !== "object") {
      this.state = {
        deadlineReminders: {},
        lastDailyReminderDate: null,
      };
      return;
    }
    if (!this.state.deadlineReminders || typeof this.state.deadlineReminders !== "object") {
      this.state.deadlineReminders = {};
    }
    if (this.state.lastDailyReminderDate === undefined) {
      this.state.lastDailyReminderDate = null;
    }
  }

  async persist() {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const payload = JSON.stringify(this.state, null, 2);
    await fs.writeFile(this.filePath, payload, "utf8");
  }

  wasDeadlineNotified(taskId, deadlineIso) {
    const key = String(taskId);
    if (!key || !deadlineIso) return false;
    return this.state.deadlineReminders[key] === deadlineIso;
  }

  async markDeadlineNotified(taskId, deadlineIso) {
    const key = String(taskId);
    if (!key || !deadlineIso) return;
    this.state.deadlineReminders[key] = deadlineIso;
    await this.persist();
  }

  wasDailyReminderSent(dateKey) {
    if (!dateKey) return false;
    return this.state.lastDailyReminderDate === dateKey;
  }

  async markDailyReminderSent(dateKey) {
    if (!dateKey) return;
    this.state.lastDailyReminderDate = dateKey;
    await this.persist();
  }
}
