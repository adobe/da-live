import { html, repeat } from 'da-lit';

const SAMPLE_TASKS = [
  { page: 'Frescopa Homepage', description: 'Translation rollout, de, fr', status: 'Need Approval', state: 'approval', requester: 'Eva' },
  { page: 'Atelier Nova', description: 'Review product copy', status: 'Need Approval', state: 'approval', requester: 'Steven' },
  { page: 'Taste Profiles', description: 'Review coffee taste profiles', status: 'In-Progress', state: 'in-progress', requester: 'Michael' },
  { page: 'Coffee Machines', description: 'Update product details', status: 'Scheduled', state: 'scheduled', requester: 'Sara' },
  { page: 'Atelier Nova Campaign', description: 'Publish launch campaign', status: 'Scheduled', state: 'scheduled', requester: 'Karina' },
];
const HEADINGS = ['Item', 'Description', 'Status', 'Assignee'];
const MIN_WIDTH = 80;
const MAX_WIDTH = 1200;

function resizeColumn({ handle, width }) {
  const table = handle.closest('table');
  const heading = handle.closest('th');
  const columns = [...table.querySelectorAll('col')];
  const widths = [...table.querySelectorAll('th')].map((th) => th.getBoundingClientRect().width);
  const next = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)));
  columns.forEach((col, index) => { col.style.width = `${index === heading.cellIndex ? next : widths[index]}px`; });
  table.style.width = `${widths.reduce((total, value, index) => total + (index === heading.cellIndex ? next : value), 0)}px`;
  handle.setAttribute('aria-valuenow', next);
}

function resizeKey(event) {
  const { currentTarget: handle, key } = event;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
  event.preventDefault();
  const { width } = handle.closest('th').getBoundingClientRect();
  const sizes = { Home: MIN_WIDTH, End: MAX_WIDTH, ArrowLeft: width - 16, ArrowRight: width + 16 };
  const next = sizes[key];
  resizeColumn({ handle, width: next });
}

function resizePointer(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const { currentTarget: handle, clientX: start, pointerId } = event;
  const { width } = handle.closest('th').getBoundingClientRect();
  const controller = new AbortController();
  handle.setPointerCapture(pointerId);
  handle.addEventListener('pointermove', (move) => {
    resizeColumn({ handle, width: width + move.clientX - start });
  }, { signal: controller.signal });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
    const options = { once: true, signal: controller.signal };
    handle.addEventListener(type, () => controller.abort(), options);
  });
}

export default function renderAttentionTable({ comments, renderCommentRow, status }) {
  return html`<div class="tasks-table">
    <div class="tasks-scroll" role="region" aria-label="Need Attention" tabindex="0">
      <table aria-labelledby="tasks-heading" aria-describedby="tasks-availability">
        <colgroup>${HEADINGS.map(() => html`<col>`)}</colgroup>
        <thead><tr>${HEADINGS.map((label) => html`<th scope="col">
          <div class="task-column-heading">
            <span>${label}</span>
            <button class="task-column-options" type="button" disabled
              aria-label=${`${label} column options`} aria-describedby="tasks-availability"
              title="Column options are unavailable for sample tasks.">
              <span class="column-options-icon" aria-hidden="true"></span>
            </button>
          </div>
          <span class="column-resizer" role="separator" aria-orientation="vertical"
            aria-label=${`Resize ${label} column`} tabindex="0"
            aria-valuemin=${MIN_WIDTH} aria-valuemax=${MAX_WIDTH} aria-valuenow="200"
            @focus=${({ currentTarget }) => currentTarget.setAttribute('aria-valuenow', Math.round(currentTarget.closest('th').getBoundingClientRect().width))}
            @keydown=${resizeKey} @pointerdown=${resizePointer}></span>
        </th>`)}</tr></thead>
        <tbody>
          ${repeat(comments || [], (comment) => comment.id, renderCommentRow)}
          ${SAMPLE_TASKS.map((task) => html`<tr>
            <td title=${task.page}>${task.page}</td><td title=${task.description}>${task.description}</td>
            <td><span class="task-status" title=${task.status}>
              <span class="task-status-dot ${task.state}" aria-hidden="true"></span><span>${task.status}</span>
            </span></td>
            <td><span class="task-requester" title=${task.requester}>
              <img src="/blocks/landing/sample-avatar.svg" width="20" height="20" alt="">
              <span>${task.requester}</span>
            </span></td>
          </tr>`)}
        </tbody>
      </table>
    </div>
    ${status}
    <p id="tasks-availability" class="tasks-preview-note">${comments?.length
      ? 'Open Comment rows are your live unresolved comment threads. Other rows are sample tasks for layout preview.'
      : 'Sample tasks for layout preview. Not live site data.'}</p>
  </div>`;
}
