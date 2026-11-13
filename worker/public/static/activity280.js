(function () {
  'use strict';
  // Presentation only: consume the admitted, dated News DTO. No fetch, storage,
  // identities, inferred remainders or separate Army collection permission.
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const masked = value => value === 'few' || value === 0 || count(value) && value >= 5;
  const node = (tag, text) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    return result;
  };
  function render(figures, formatTime) {
    const section = node('section');
    section.setAttribute('data-activity-comparison', 'news');
    if (!figures || !count(figures.asOf) || typeof formatTime !== 'function') return null;
    const windows = ['day', 'week'];
    const rows = [
      {label: 'Characters joined', values: windows.map(key => figures.roster?.[key]?.joined ?? null), accepts: count},
      {label: 'Characters left', values: windows.map(key => figures.roster?.[key]?.left ?? null), accepts: count},
      {label: 'Applications first saved', values: windows.map(key => figures.applications?.[key]?.firstSaved ?? null), accepts: masked},
      {label: 'Decisions saved', values: windows.map(key => figures.applications?.[key]?.decided ?? null), accepts: masked},
    ];
    // A malformed value stays unavailable; a suppressed count never acquires a
    // numeric bar, net, total, proportion or value through accessibility markup.
    for (const row of rows) row.values = row.values.map(value => row.accepts(value) ? value : null);
    const largest = Math.max(1, ...rows.flatMap(row => row.values.filter(count)));
    section.append(node('h4', 'Activity at a glance'));
    const table = node('table'); table.className = 'data';
    table.append(node('caption', 'Last day and last seven days · counted ' + formatTime(figures.asOf)));
    const head = node('thead'), headings = node('tr');
    for (const label of ['Activity', 'Last day', 'Last 7 days']) {
      const cell = node('th', label); cell.setAttribute('scope', 'col'); headings.append(cell);
    }
    head.append(headings); table.append(head);
    const body = node('tbody');
    for (const row of rows) {
      const tr = node('tr'), heading = node('th', row.label); heading.setAttribute('scope', 'row'); tr.append(heading);
      for (const value of row.values) {
        const cell = node('td'); cell.append(node('span', value === 'few' ? 'Fewer than 5' : value === null ? 'Unavailable' : String(value)));
        if (count(value)) {
          const bar = node('meter'); bar.min = 0; bar.max = largest; bar.value = value;
          bar.setAttribute('aria-hidden', 'true'); bar.setAttribute('tabindex', '-1'); cell.append(bar);
        }
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body);
    const wrap = node('div'); wrap.className = 'table-wrap'; wrap.append(table); section.append(wrap);
    section.append(node('p', 'The day is part of the seven-day window; do not add the columns. These are dated observations, not a live population or a count of unique people. Unavailable history and counts below the application disclosure threshold are not zero.'));
    return section;
  }
  window.OlympusActivity280 = Object.freeze({render});
}());
