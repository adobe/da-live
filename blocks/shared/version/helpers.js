import { formatDate } from '../utils.js';

export function formatVersions(json) {
  // Sort by timestamp epoch
  json.sort((a, b) => b.timestamp - a.timestamp);

  // Make human readable entries
  const ungrouped = json.map((entry) => {
    const { date, time } = formatDate(entry.timestamp);
    return {
      date,
      time,
      ...entry,
      isVersion: !!entry.url,
    };
  });

  // Group consecutive audit entries by date, but never across a version boundary
  return ungrouped.reduce((acc, entry) => {
    if (entry.isVersion) {
      acc.push(entry);
    } else {
      const last = acc[acc.length - 1];
      if (last && !last.isVersion && last.date === entry.date) {
        last.audits.push(entry);
      } else {
        acc.push({ date: entry.date, audits: [entry] });
      }
    }
    return acc;
  }, []);
}
