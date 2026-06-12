const DAY_MS = 24 * 60 * 60 * 1000;

const DEADLINE_OPTION_DAYS = {
  "Tomorrow": 1,
  "3 days": 3,
  "7 days": 7,
  "30 days": 30,
  "3 months": 90,
};

function deadlineFromOption(option) {
  const days = DEADLINE_OPTION_DAYS[option];
  return days == null ? null : Date.now() + days * DAY_MS;
}

function startOfToday() {
  const d = new Date(Date.now());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// A saved page is on the readlist only once it has been explicitly added —
// either with a deadline (readBy) or without one ("No deadline" → onReadlist).
// Plain saved pages are not on the readlist.
function isOnReadlist(page) {
  return page.readBy != null || page.onReadlist === true;
}

function getDeadlineSection(readBy) {
  if (readBy == null) return "backlog";
  if (readBy < startOfToday()) return "pastdue";
  const days = (readBy - Date.now()) / DAY_MS;
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

function computeImminentSet(entries, max = 6) {
  return entries
    .filter((e) => e.readBy != null)
    .sort((a, b) => a.readBy - b.readBy)
    .slice(0, max);
}

function daysOverdue(readBy) {
  return Math.ceil((startOfToday() - readBy) / DAY_MS);
}

function formatDeadlineDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDueLabel(readBy, savedAt) {
  if (readBy == null) {
    return { text: `Saved ${formatDeadlineDate(savedAt)}`, colorClass: "label-saved" };
  }
  if (readBy < startOfToday()) {
    const days = daysOverdue(readBy);
    const unit = days === 1 ? "day" : "days";
    return {
      text: `${days} ${unit} overdue · ${formatDeadlineDate(readBy)}`,
      colorClass: "label-overdue",
    };
  }
  const days = Math.ceil((readBy - Date.now()) / DAY_MS);
  const text =
    days <= 0
      ? `Due today · ${formatDeadlineDate(readBy)}`
      : `Due in ${days} ${days === 1 ? "day" : "days"} · ${formatDeadlineDate(readBy)}`;
  return { text, colorClass: "label-due" };
}

if (typeof module !== "undefined") {
  module.exports = {
    deadlineFromOption,
    isOnReadlist,
    getDeadlineSection,
    computeImminentSet,
    daysOverdue,
    formatDeadlineDate,
    formatDueLabel,
  };
}
