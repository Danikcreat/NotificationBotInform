import { promises as fs } from "fs";
import path from "path";

export default class StateStore {
  constructor(filePath, logger) {
    this.filePath = filePath;
    this.logger = logger;
    this.state = {
      deadlineReminders: {},
    };
    this.ready = false;
  }

  async init() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw);
      this.ready = true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.logger?.warn({ err: error }, "Failed to read notifier state, starting from scratch");
      }
      this.ready = true;
      await this.persist();
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
}
