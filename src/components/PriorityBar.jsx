import { epochOf, formatDate, formatDuration, isDayOnly } from "../format.js";

/**
 * Shows when the challenger's page and the registered page were published on one time axis,
 * with the minimum gap the contract requires drawn around the registered page's date.
 */
export default function PriorityBar({ challenger, respondent, evidence, gapSeconds = 3600, registeredAt }) {
  const c = epochOf(challenger);
  const rPage = epochOf(respondent);
  const e = epochOf(evidence);
  const known = [rPage, e].filter((x) => x !== null);
  const r = known.length ? Math.min(...known) : epochOf(registeredAt);
  const rLabel = known.length
    ? e !== null && e === r ? "Defense evidence" : "Registered page"
    : "Registered on-chain";

  if (c === null || r === null) {
    return <p className="mute small">No trusted publication date (an archive capture) exists for the challenger's page, so the contract cannot rule on order.</p>;
  }

  const lo = Math.min(c, r) - Math.max(gapSeconds, 1);
  const hi = Math.max(c, r) + Math.max(gapSeconds, 1);
  const span = hi - lo;
  const pos = (t) => `${((t - lo) / span) * 100}%`;
  const bandLeft = ((r - gapSeconds - lo) / span) * 100;
  const bandWidth = ((gapSeconds * 2) / span) * 100;

  const diff = r - c; // positive: challenger earlier
  let verdict;
  if (diff >= gapSeconds) verdict = `Challenger is earlier by ${formatDuration(diff)}, at least the ${formatDuration(gapSeconds)} gap.`;
  else if (-diff >= gapSeconds) verdict = `Challenger is later by ${formatDuration(-diff)}.`;
  else verdict = `Within ${formatDuration(gapSeconds)} of each other: too close to call.`;

  const challengerFirst = c <= r;
  return (
    <figure className="priority" aria-label="Publication order">
      <div className="priority-track">
        <div className="priority-band" style={{ left: `${bandLeft}%`, width: `${Math.max(bandWidth, 0.6)}%` }} title={`${formatDuration(gapSeconds)} gap`} />
        <span className="priority-dot priority-dot-c" style={{ left: pos(c) }} />
        <span className="priority-dot priority-dot-r" style={{ left: pos(r) }} />
      </div>
      <div className={`priority-labels ${challengerFirst ? "" : "priority-flip"}`}>
        <div>
          <p className="priority-name">Challenger's page</p>
          <p className="priority-date">{formatDate(challenger)}</p>
          {isDayOnly(challenger) ? <p className="small mute">Day only, read as 00:00 UTC</p> : null}
        </div>
        <div>
          <p className="priority-name">{rLabel}</p>
          <p className="priority-date">{formatDate(known.length ? (e === r ? evidence : respondent) : registeredAt)}</p>
        </div>
      </div>
      <figcaption className="priority-verdict">{verdict}</figcaption>
    </figure>
  );
}
