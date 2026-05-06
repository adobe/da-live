const TIME_FORMAT_OPTIONS = { hour: 'numeric', minute: '2-digit' };

function parseTimestamp(timestampRaw) {
  if (timestampRaw == null || timestampRaw === '') return null;
  const parsedDate = new Date(timestampRaw);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatAbsolute(dateInstant, referenceNow = new Date()) {
  const timeSegment = dateInstant.toLocaleTimeString(undefined, TIME_FORMAT_OPTIONS);
  if (dateInstant.getFullYear() === referenceNow.getFullYear()) {
    const dateSegment = dateInstant.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    return `${dateSegment}, ${timeSegment}`;
  }
  const dateSegment = dateInstant.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return `${dateSegment}, ${timeSegment}`;
}

function formatRelative(dateInstant, referenceNow = new Date()) {
  const elapsedMilliseconds = referenceNow - dateInstant;
  const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const eventCalendarDay = dateInstant.toDateString();
  const referenceCalendarDay = referenceNow.toDateString();

  let displayLabel;
  if (eventCalendarDay === referenceCalendarDay) {
    const elapsedSeconds = Math.floor(elapsedMilliseconds / 1000);
    if (elapsedSeconds < 60) displayLabel = relativeTimeFormatter.format(0, 'second');
    else {
      const elapsedMinutes = Math.floor(elapsedSeconds / 60);
      if (elapsedMinutes < 60) displayLabel = relativeTimeFormatter.format(-elapsedMinutes, 'minute');
      else {
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        displayLabel = relativeTimeFormatter.format(-elapsedHours, 'hour');
      }
    }
  } else {
    const referenceYesterday = new Date(referenceNow);
    referenceYesterday.setDate(referenceYesterday.getDate() - 1);
    if (eventCalendarDay === referenceYesterday.toDateString()) {
      const relativeDayPhrase = relativeTimeFormatter.format(-1, 'day');
      const timeSegment = dateInstant.toLocaleTimeString(undefined, TIME_FORMAT_OPTIONS);
      displayLabel = `${relativeDayPhrase}, ${timeSegment}`;
    } else {
      displayLabel = formatAbsolute(dateInstant, referenceNow);
    }
  }

  return displayLabel;
}

export function formatColumnLastModified(lastModified) {
  const lastModifiedDate = parseTimestamp(lastModified);
  if (!lastModifiedDate) return { label: null };
  return {
    label: formatRelative(lastModifiedDate),
    title: `Last modified on ${formatAbsolute(lastModifiedDate)}`,
  };
}
