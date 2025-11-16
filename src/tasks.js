import { format, formatDistanceToNowStrict, isBefore, isValid, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export function parseDeadline(deadline) {
  if (!deadline) return null;
  const date = typeof deadline === "string" ? parseISO(deadline) : new Date(deadline);
  if (!isValid(date)) return null;
  return date;
}

export function isDeadlineWithinWindow(deadline, hours, now = new Date()) {
  const targetDate = parseDeadline(deadline);
  if (!targetDate) return false;
  if (isBefore(targetDate, now)) {
    return false;
  }
  const diffMs = targetDate.getTime() - now.getTime();
  const windowMs = Math.max(0, Number(hours) || 0) * 60 * 60 * 1000;
  return diffMs <= windowMs;
}

export function formatDeadline(deadline, now = new Date()) {
  const targetDate = parseDeadline(deadline);
  if (!targetDate) return "не задан";
  const formattedDate = format(targetDate, "dd MMMM yyyy HH:mm", { locale: ru });
  const relative = formatDistanceToNowStrict(targetDate, { locale: ru, addSuffix: true });
  return `${formattedDate} (${relative})`;
}

export function buildTaskSummary(task, now = new Date()) {
  const parts = [];
  parts.push(`• ${task.title || "Задача без названия"}`);
  if (task.status) {
    parts.push(`  Статус: ${task.status}`);
  }
  if (task.deadline) {
    parts.push(`  Дедлайн: ${formatDeadline(task.deadline, now)}`);
  }
  if (task.priority) {
    parts.push(`  Приоритет: ${task.priority}`);
  }
  return parts.join("\n");
}

export function tasksForLogin(tasks, login) {
  if (!Array.isArray(tasks) || !login) return [];
  const normalized = String(login || "").trim().toLowerCase();
  return tasks.filter((task) => {
    const responsible = String(task.responsible || "").trim().toLowerCase();
    return responsible && responsible === normalized;
  });
}
