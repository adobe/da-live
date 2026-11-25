# Canvas agent activity

The **Agent Activity** tab shows which pages the chat agent is working on for the
latest prompt.

## When it appears

Sending a prompt in chat opens the tool panel on Agent Activity and pins its tab
next to Outline (or last, if Outline isn't pinned). It also stays available from
the **Panels** menu. Each new prompt replaces the previous one's activity.

## What it shows

- How many pages the agent has identified, and whether the turn is running,
  completed, stopped, or failed.
- How many of those pages are finished (done, failed, or rejected).
- A count per status and each page's path and status: needs approval, working,
  failed, rejected, or done.

## Data source

da-nx's chat emits `CHAT_EVENT.TURN_STARTED`, `TURN_PROGRESS`, and
`TURN_COMPLETED` on `document` (see da-nx `docs/chat-ui-component.md`). Pages
come from the paths in the agent's tool calls; folder listings are excluded.
`installAgentActivity` (`blocks/canvas/ew-agent-activity/agent-activity.js`)
turns these into a state published on `canvasBus.agentActivityState`, which
replays the latest value so the lazily loaded panel catches up.

Counts reflect the tool calls the agent has made so far, not a total the agent
plans in advance.
