import { format, formatDistanceToNowStrict, isBefore, isSameDay, isValid, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

function normalizeLogin(login) {
  return String(login || "")
    .trim()
    .toLowerCase();
}

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
  if (!targetDate) return "D«Dæ DúDøD'DøD«";
  const formattedDate = format(targetDate, "dd MMMM yyyy HH:mm", { locale: ru });
  const relative = formatDistanceToNowStrict(targetDate, { locale: ru, addSuffix: true });
  return `${formattedDate} (${relative})`;
}

export function isDeadlineOnDate(deadline, referenceDate = new Date()) {
  const targetDate = parseDeadline(deadline);
  if (!targetDate) return false;
  return isSameDay(targetDate, referenceDate);
}

export function getTaskLoginCandidates(task) {
  if (!task) return [];
  const uniqueLogins = new Set();
  const collect = (value) => {
    const normalized = normalizeLogin(value);
    if (normalized) {
      uniqueLogins.add(normalized);
    }
  };
  if (Array.isArray(task.assigneeLogins)) {
    task.assigneeLogins.forEach(collect);
  }
  if (Array.isArray(task.assignees)) {
    task.assignees.forEach((assignee) => collect(assignee?.login));
  }
  if (task.responsibleLogin) {
    collect(task.responsibleLogin);
  }
  collect(task.responsible);
  return Array.from(uniqueLogins);
}

export function buildTaskSummary(task, now = new Date()) {
  const parts = [];
  parts.push(`ƒ?› ${task.title || "D-DøD'Dø¥ØDø DñDæDú D«DøDúDýDøD«D,¥?"}`);
  if (task.status) {
    parts.push(`  D­¥,Dø¥,¥Ÿ¥?: ${task.status}`);
  }
  if (task.deadline) {
    parts.push(`  D"DæD'D¯DøD1D«: ${formatDeadline(task.deadline, now)}`);
  }
  if (task.priority) {
    parts.push(`  DY¥?D,D_¥?D,¥,Dæ¥,: ${task.priority}`);
  }
  return parts.join("\n");
}

export function tasksForLogin(tasks, login) {
  if (!Array.isArray(tasks) || !login) return [];
  const normalized = normalizeLogin(login);
  if (!normalized) return [];
  return tasks.filter((task) => getTaskLoginCandidates(task).includes(normalized));
}
