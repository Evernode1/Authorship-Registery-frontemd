import { disputeOutcome } from "../outcomes.js";
import { useState } from "react";
import { useApp, useNav, useUrlPreview } from "../hooks.jsx";
import { Addr, Button, ConfirmButton, Field, Link, Notice, Pill } from "./ui.jsx";
import PriorityBar from "./PriorityBar.jsx";
import {
  DATE_BASIS_TEXT, EVIDENCE_TEXT, OUTCOME_TEXT, PROOF_TEXT, SIMILARITY_TEXT, bpsShare, clean, disputeState, formatCountdown, formatDate, formatGen, nowEpoch, sameAddr,
} from "../format.js";

function RespondForm({ dispute, work, onDone }) {
  const { send, busy } = useApp();
  const [evidence, setEvidence] = useState("");
  const [statement, setStatement] = useState("");
  const preview = useUrlPreview(evidence);
  const hasEvidence = clean(evidence).length > 0;
  const hasStatement = clean(statement).length > 0;
  const stmtOk = clean(statement).length <= 500;
  const clash = preview.canonical && (preview.canonical === work?.url || preview.canonical === dispute.challenger_url);
  const valid = (hasEvidence || hasStatement) && stmtOk && !preview.error && !clash && (!hasEvidence || clean(evidence).length >= 10);
  return (
    <form
      className="form inset"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await send("Respond to dispute", "respond_to_dispute", [dispute.dispute_id, clean(evidence), clean(statement)]);
        if (ok) onDone?.();
      }}
    >
      <p className="form-lead">You can respond once. An archive snapshot or earlier post of your work is the strongest evidence, and it only counts if it shows the same content as your registered page. Give a link, a statement, or both.</p>
      <Field label="Evidence link (optional)" hint={preview.canonical ? `Stored as ${preview.canonical}` : "Must differ from your registered link and the challenger's link."}>
        <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://web.archive.org/web/…" maxLength={300} />
      </Field>
      {preview.error ? <Notice tone="rust">{preview.error}</Notice> : null}
      {clash ? <Notice tone="rust">The evidence link must differ from both disputed links.</Notice> : null}
      <Field label="Your response (optional if you gave evidence)" hint={`${clean(statement).length}/500`}>
        <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} maxLength={500} />
      </Field>
      <div className="actions">
        <Button type="submit" busy={busy} disabled={!valid}>Send response</Button>
        <Button type="button" variant="quiet" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

/** Plain-language account of where the money went (or will go) for this dispute. */
function Settlement({ d, config }) {
  const stake = d.stake;
  const challenger = <Addr value={d.challenger} />;
  if (d.status === "UPHELD") {
    return (
      <p className="small">
        Upheld: {challenger} got the {formatGen(stake)} GEN stake back plus {Number(config.challenger_bounty_bps) / 100}% of the author's bond; the rest of that bond went to the reward pool. The registration was overturned
        {d.resulting_work ? `, and work #${d.resulting_work} now holds priority` : ""}.
      </p>
    );
  }
  if (d.status === "REJECTED") {
    const share = bpsShare(stake, config.author_share_bps);
    return (
      <p className="small">
        Rejected: the author received {formatGen(share)} GEN ({Number(config.author_share_bps) / 100}% of the stake) and the rest went to the reward pool. {challenger} cannot dispute this work again.
      </p>
    );
  }
  if (d.status === "CLOSED_INCONCLUSIVE") {
    const fee = bpsShare(stake, config.inconclusive_fee_bps);
    return <p className="small">Closed after {d.attempts} undecided rounds: {challenger} was refunded {formatGen(BigInt(stake) - fee)} GEN, and the {formatGen(fee)} GEN fee went to the reward pool. The work is open to challenge again.</p>;
  }
  if (d.status === "WITHDRAWN") {
    const fee = bpsShare(stake, config.withdraw_fee_bps);
    return <p className="small">Withdrawn by the challenger: {formatGen(BigInt(stake) - fee)} GEN refunded, {formatGen(fee)} GEN fee to the reward pool.</p>;
  }
  return (
    <p className="small mute">
      Stake held: {formatGen(stake)} GEN. After {config.max_resolution_attempts} undecided rounds it is refunded minus {Number(config.inconclusive_fee_bps) / 100}%. A decisive round pays whoever triggers it {formatGen(config.resolver_reward_wei)} GEN from the reward pool.
    </p>
  );
}

export default function DisputeRow({ dispute: d, work }) {
  const { account, config, send, busy } = useApp();
  const nav = useNav();
  const [responding, setResponding] = useState(false);
  const now = nowEpoch();
  const st = disputeState(d, config, now);
  const isAuthor = work && sameAddr(account, work.author);
  const isChallenger = sameAddr(account, d.challenger);
  const hasRound = d.attempts > 0 || !st.isOpen;
  const fee = bpsShare(d.stake, config.withdraw_fee_bps);

  return (
    <article className="row">
      <header className="row-head">
        <div>
          <h3 className="row-title">
            Dispute #{d.dispute_id}
            {work ? <> on <Link href={work.original_url || work.url}>{work.title}</Link> <span className="mute small">work #{work.work_id}</span></> : null}
          </h3>
          <p className="small mute">
            Opened {formatDate(d.opened_at)} by <Addr value={d.challenger} />{isChallenger ? " (you)" : ""}, stake {formatGen(d.stake)} GEN
            {work ? <>. Author <Addr value={work.author} />{isAuthor ? " (you)" : ""}</> : null}
          </p>
        </div>
        <Pill status={d.status} />
      </header>

      <blockquote className="statement">{d.statement}</blockquote>
      <p className="small">
        Challenger's earlier page: <Link href={d.challenger_url}>{d.challenger_url}</Link>
      </p>

      {d.responded ? (
        <div className="statement-block">
          <p className="small mute">Author's response, {formatDate(d.responded_at)}</p>
          {d.respondent_statement ? <blockquote className="statement">{d.respondent_statement}</blockquote> : <p className="small mute">No written statement, evidence only.</p>}
          {d.evidence_url ? <p className="small">Evidence: <Link href={d.evidence_url}>{d.evidence_url}</Link></p> : null}
        </div>
      ) : st.isOpen ? (
        <p className="small mute">
          {st.windowOpen
            ? `The author can respond until ${formatDate(d.response_deadline)} (${formatCountdown(st.deadline, now)}).`
            : "The response window has closed without a response. Anyone can now resolve this dispute."}
        </p>
      ) : (
        <p className="small mute">The author did not respond before the dispute closed.</p>
      )}

      {hasRound ? (
        <div className="ruling">
          <p className="ruling-line">
            {d.rationale || OUTCOME_TEXT[d.outcome_code] || "No ruling recorded yet."}
            {d.attempts ? <span className="mute"> Round {d.attempts} of {config.max_resolution_attempts}.</span> : null}
          </p>
          <PriorityBar
            challenger={d.challenger_published_at}
            respondent={d.respondent_published_at}
            evidence={d.evidence_status === "SAME_CONTENT" ? d.evidence_published_at : ""}
            gapSeconds={Number(config.min_priority_gap_seconds)}
            registeredAt={work?.registered_at}
          />
          <ul className="readings small">
            <li>{SIMILARITY_TEXT[d.similarity] || d.similarity}</li>
            <li>{PROOF_TEXT[d.challenger_page_status] || d.challenger_page_status}</li>
            <li>{EVIDENCE_TEXT[d.evidence_status] || d.evidence_status}</li>
            {d.challenger_date_basis ? <li>Challenger date source: {DATE_BASIS_TEXT[d.challenger_date_basis] || d.challenger_date_basis}</li> : <li>No trusted date for the challenger's page</li>}
            {d.respondent_date_basis ? <li>Registered page date source: {DATE_BASIS_TEXT[d.respondent_date_basis] || d.respondent_date_basis}</li> : <li>Registered page ranked at its on-chain registration time (no trusted earlier date)</li>}
          </ul>
          <dl className="facts small">
            {d.outcome_code ? <div><dt>Outcome code</dt><dd className="mono">{d.outcome_code}</dd></div> : null}
            {d.last_checked_at ? <div><dt>Last round</dt><dd>{formatDate(d.last_checked_at)}</dd></div> : null}
            {d.resolved_at ? <div><dt>Closed</dt><dd>{formatDate(d.resolved_at)}</dd></div> : null}
            {d.resulting_work ? (
              <div><dt>Priority now with work</dt><dd><button type="button" className="addr-link" onClick={() => nav?.openFind("work", d.resulting_work)}>#{d.resulting_work}</button></dd></div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <Settlement d={d} config={config} />

      <div className="actions">
        {st.canRespond && isAuthor ? (
          <Button variant={responding ? "quiet" : "primary"} onClick={() => setResponding((v) => !v)}>
            {responding ? "Close" : "Respond"}
          </Button>
        ) : null}
        {st.isOpen && isChallenger ? (
          <ConfirmButton
            label="Withdraw dispute"
            confirmLabel="Withdraw and pay fee"
            busy={busy}
            message={`You get ${formatGen(BigInt(d.stake) - fee)} GEN back. The ${Number(config.withdraw_fee_bps) / 100}% fee (${formatGen(fee)} GEN) goes to the reward pool.`}
            onConfirm={() => send("Withdraw dispute", "withdraw_dispute", [d.dispute_id])}
          />
        ) : null}
        {st.isOpen ? (
          <Button
            variant={st.canResolve ? "primary" : "secondary"}
            busy={busy}
            disabled={!st.canResolve}
            title="Validators read both pages (and any evidence). This can take a few minutes."
            onClick={() => send("Resolve dispute", "resolve_dispute", [d.dispute_id], 0n, { after: () => disputeOutcome(d.dispute_id) })}
          >
            Resolve dispute
          </Button>
        ) : null}
      </div>
      {st.isOpen && st.cooling ? <p className="small mute">The next round opens {formatCountdown(st.nextRound, now)}.</p> : null}
      {st.isOpen && !st.canResolve && !st.cooling ? (
        <p className="small mute">Resolving opens once the author responds or the response window closes.</p>
      ) : null}
      {responding ? <RespondForm dispute={d} work={work} onDone={() => setResponding(false)} /> : null}
    </article>
  );
}
