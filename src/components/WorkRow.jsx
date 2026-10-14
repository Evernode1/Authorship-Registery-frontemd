import { useEffect, useState } from "react";
import { read } from "../chain.js";
import { ownershipOutcome } from "../outcomes.js";
import { useApp, useNav, useUrlPreview } from "../hooks.jsx";
import { Addr, BlacklistBanner, Button, ConfirmButton, Field, Link, Notice, Pill, ProofToken } from "./ui.jsx";
import {
  OWNERSHIP_RESULT_TEXT, clean, epochOf, formatCountdown, formatDate, formatDuration, formatGen, nowEpoch, sameAddr,
} from "../format.js";

function ChallengeForm({ work, onDone }) {
  const { account, config, send, busy, status } = useApp();
  const [url, setUrl] = useState("");
  const [statement, setStatement] = useState("");
  const [lost, setLost] = useState(false);
  const preview = useUrlPreview(url);

  // The contract refuses a second challenge from someone who already lost on the merits.
  useEffect(() => {
    if (!account) return undefined;
    let live = true;
    read("list_disputes_for_work", [work.work_id])
      .then((list) => live && setLost(list.some((d) => sameAddr(d.challenger, account) && d.status === "REJECTED")))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [account, work.work_id]);

  const urlOk = clean(url).length >= 10 && clean(url).length <= 300;
  const stmtOk = clean(statement).length >= 10 && clean(statement).length <= 500;
  const sameAsWork = preview.canonical && preview.canonical === work.url;
  const takenByOther = preview.existing && !sameAddr(preview.existing.author, account);
  const ownNotActive = preview.existing && sameAddr(preview.existing.author, account) && preview.existing.status !== "ACTIVE";
  // The contract now requires the challenger to hold an ACTIVE registration of the challenger URL.
  const ownRegistration = preview.existing && sameAddr(preview.existing.author, account) && preview.existing.status === "ACTIVE"
    ? preview.existing
    : null;
  const needsRegistration = !!preview.canonical && !preview.existing && !sameAsWork;
  const blocked = lost || status.blacklisted || !!preview.error || sameAsWork || takenByOther || ownNotActive || !ownRegistration;

  return (
    <form
      className="form inset"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ownRegistration) return;
        const ok = await send(
          "Open dispute",
          "open_dispute",
          [work.work_id, ownRegistration.work_id, clean(url), clean(statement)],
          BigInt(config.challenge_stake_wei)
        );
        if (ok) onDone?.();
      }}
    >
      <p className="form-lead">
        Challenge this work by showing your earlier page. First register that page's link under your wallet. Then put the tag below inside the HTML <code>&lt;head&gt;</code> of that page. Text elsewhere on the page does not count:
      </p>
      {ownRegistration ? (
        <ProofToken address={account} workId={ownRegistration.work_id} />
      ) : account ? (
        <Notice>Register the challenger link under your wallet to get your proof tag.</Notice>
      ) : (
        <Notice>Connect a wallet to see your proof token.</Notice>
      )}
      {lost ? <Notice tone="rust">You already lost a dispute against this work, so the contract will not accept another from this wallet.</Notice> : null}
      <Field label="Your earlier page" hint={preview.canonical ? `Stored as ${preview.canonical}` : "A public link where you published the content first."}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourblog.example/first-draft" maxLength={300} required />
      </Field>
      <Notice tone="amber">
        Your page's own date is not trusted. The contract uses the earliest Internet Archive capture of this link, and compares the archived text with the registered work. If it was never archived, the dispute stays inconclusive.
        {urlOk ? <> <Link href={`https://web.archive.org/web/19910101000000/${clean(url)}`}>Check the earliest capture</Link>.</> : null}
      </Notice>
      {preview.error ? <Notice tone="rust">{preview.error}</Notice> : null}
      {sameAsWork ? <Notice tone="rust">That is the registered link itself. Your page must be a different link.</Notice> : null}
      {takenByOther ? <Notice tone="rust">That link is registered by another address (work #{preview.existing.work_id}). Dispute that registration instead.</Notice> : null}
      {ownNotActive ? <Notice tone="rust">You registered that link, but the registration is not active, so it cannot be used.</Notice> : null}
      {needsRegistration ? <Notice tone="amber">This link is not registered yet. Register it under your wallet first, then return to dispute.</Notice> : null}
      {ownRegistration ? (
        <Notice tone="moss">You registered that link yourself (work #{ownRegistration.work_id}). Your proof tag is bound to that registration.</Notice>
      ) : null}
      <Field label="What happened" hint={`${clean(statement).length}/500, at least 10 characters`}>
        <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} maxLength={500} required />
      </Field>
      <p className="small mute">
        Stake {formatGen(config.challenge_stake_wei)} GEN. If upheld you get it back plus {Number(config.challenger_bounty_bps) / 100}% of the author's bond. If rejected the author receives {Number(config.author_share_bps) / 100}% of it. Three inconclusive rounds, or withdrawing, return it minus a {Number(config.withdraw_fee_bps) / 100}% fee.
      </p>
      <div className="actions">
        <Button type="submit" busy={busy} disabled={!urlOk || !stmtOk || blocked}>Open dispute</Button>
        <Button type="button" variant="quiet" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

export default function WorkRow({ work, compact = false }) {
  const { account, config, send, busy, status } = useApp();
  const nav = useNav();
  const [challenging, setChallenging] = useState(false);
  const now = nowEpoch();

  const isAuthor = sameAddr(account, work.author);
  const live = work.status === "ACTIVE" || work.status === "UNDER_DISPUTE";
  const verified = work.ownership === "VERIFIED";
  const registered = epochOf(work.registered_at);
  const lockEnds = registered === null ? null : registered + Number(config.bond_lock_seconds);
  const lockOpen = lockEnds !== null && now >= lockEnds;
  const hasBond = BigInt(work.bond || "0") > 0n;
  const windowEnds = epochOf(work.challenge_window_closes_at);
  const windowOpen = windowEnds === null || now <= windowEnds;

  const lastCheck = epochOf(work.ownership_checked_at);
  const recheckAt = work.ownership_attempts > 0 && lastCheck !== null ? lastCheck + Number(config.ownership_recheck_cooldown_seconds || 86400) : null;
  const verifyCooling = recheckAt !== null && now < recheckAt;

  // The ownership check is permissionless on purpose: anyone may trigger it, the page and token are fixed by the record.
  const canVerify = live && !verified && !work.author_blacklisted && !verifyCooling;
  const canChallenge = !isAuthor && work.status === "ACTIVE" && windowOpen && !status.blacklisted;
  const canWithdraw = isAuthor && work.status === "ACTIVE";
  const canRelease = isAuthor && (work.status === "ACTIVE" || work.status === "WITHDRAWN") && hasBond;

  return (
    <article className="row">
      <header className="row-head">
        <div>
          <h3 className="row-title">
            <Link href={work.original_url || work.url}>{work.title}</Link> <span className="mute small">#{work.work_id}</span>
          </h3>
          <p className="small mute break">{work.url}</p>
        </div>
        <div className="pills">
          <Pill status={work.status} />
          <Pill status={work.authorship_tier || work.ownership} />
          {work.author_blacklisted ? <Pill tone="rust">Author blacklisted</Pill> : null}
        </div>
      </header>

      <dl className="facts">
        <div><dt>Author</dt><dd><Addr value={work.author} />{isAuthor ? " (you)" : ""}</dd></div>
        <div><dt>Type</dt><dd>{work.content_type}</dd></div>
        <div><dt>Registered</dt><dd>{formatDate(work.registered_at)}</dd></div>
        <div>
          <dt>{windowOpen ? "Open to challenge until" : "Challenge window closed"}</dt>
          <dd>{formatDate(work.challenge_window_closes_at)}</dd>
        </div>
        <div><dt>Bond</dt><dd>{hasBond ? `${formatGen(work.bond)} GEN` : "None held"}</dd></div>
        <div><dt>Challenges survived</dt><dd>{work.disputes_survived}</dd></div>
        {work.page_published_at ? <div><dt>Date the page claims</dt><dd>{formatDate(work.page_published_at)} <span className="mute small">(self-declared, never used to decide a dispute)</span></dd></div> : null}
        {work.ownership_attempts > 0 ? (
          <div>
            <dt>Ownership checks</dt>
            <dd>{work.ownership_attempts}, last {formatDate(work.ownership_checked_at)}</dd>
          </div>
        ) : null}
        {work.ownership_result ? <div><dt>Last check result</dt><dd>{OWNERSHIP_RESULT_TEXT[work.ownership_result] || work.ownership_result}</dd></div> : null}
        {work.status === "UNDER_DISPUTE" && work.active_dispute ? (
          <div><dt>Open dispute</dt><dd><button type="button" className="addr-link" onClick={() => nav?.openFind("dispute", work.active_dispute)}>#{work.active_dispute}</button></dd></div>
        ) : null}
        {work.superseded_by ? (
          <div><dt>Superseded by work</dt><dd><button type="button" className="addr-link" onClick={() => nav?.openFind("work", work.superseded_by)}>#{work.superseded_by}</button></dd></div>
        ) : null}
        {work.origin_dispute ? (
          <div><dt>Priority won in dispute</dt><dd><button type="button" className="addr-link" onClick={() => nav?.openFind("dispute", work.origin_dispute)}>#{work.origin_dispute}</button></dd></div>
        ) : null}
        {work.fingerprint ? <div className="wide"><dt>Fingerprint (sha256)</dt><dd className="mono break">{work.fingerprint}</dd></div> : null}
      </dl>

      {work.status === "OVERTURNED" ? (
        <Notice tone="rust">
          A challenge against this registration was upheld, so priority moved to work #{work.superseded_by}.{" "}
          {nav ? <button type="button" className="addr-link" onClick={() => nav.openLookup(work.url)}>See the current first author</button> : null}
        </Notice>
      ) : null}
      {live && !verified && !compact ? (
        <Notice tone="amber">
          This is an unverified claim, not established authorship: it only shows that this address registered the link first on-chain. Ownership is proven when the page carries the author's proof tag.
        </Notice>
      ) : null}
      {work.status === "WITHDRAWN" ? <Notice>The author withdrew this registration. The link is free to register again.</Notice> : null}
      {work.author_blacklisted && live ? (
        <Notice tone="amber">The author is blacklisted, so ownership checks are refused. They can still answer disputes opened against them.</Notice>
      ) : null}

      {!compact && live && !verified && !work.author_blacklisted ? (
        <div className="inset">
          <p className="small">
            {isAuthor
              ? "To verify ownership, put this tag inside the HTML <head> of your page, then press Verify ownership. The same text in the page body, a comment or a reply does not count."
              : "This tag must be in the registered page's HTML head for an ownership check to pass. Anyone can run the check; a pass pays the caller from the reward pool."}
          </p>
          <ProofToken address={work.author} workId={work.work_id} />
        </div>
      ) : null}

      <div className="actions">
        {canVerify ? (
          <Button
            variant="secondary"
            busy={busy}
            title={`A successful check pays the caller ${formatGen(config.keeper_reward_wei)} GEN from the reward pool, if the pool can afford it.`}
            onClick={() => send("Verify ownership", "verify_work_ownership", [work.work_id], 0n, { after: () => ownershipOutcome(work.work_id) })}
          >
            {isAuthor ? "Verify ownership" : "Run ownership check"}
          </Button>
        ) : null}
        {canWithdraw ? (
          <ConfirmButton
            label="Withdraw registration"
            confirmLabel="Withdraw registration"
            busy={busy}
            message={`This frees the link and ends your claim on it. Your ${formatGen(work.bond)} GEN bond stays locked until the lock ends, then you can release it. A work under dispute cannot be withdrawn.`}
            onConfirm={() => send("Withdraw registration", "withdraw_registration", [work.work_id])}
          />
        ) : null}
        {canRelease ? (
          <Button
            variant="secondary"
            busy={busy}
            disabled={!lockOpen}
            title={lockOpen ? "" : `Bond unlocks ${formatDate(new Date((lockEnds ?? 0) * 1000).toISOString())}`}
            onClick={() => send("Release bond", "release_bond", [work.work_id])}
          >
            Release bond
          </Button>
        ) : null}
        {canChallenge ? (
          <Button variant={challenging ? "quiet" : "primary"} onClick={() => setChallenging((v) => !v)}>
            {challenging ? "Close" : "Challenge this work"}
          </Button>
        ) : null}
        {nav ? <Button variant="quiet" onClick={() => nav.openLookup(work.url)}>Look up this link</Button> : null}
      </div>

      {live && !verified && verifyCooling ? (
        <p className="small mute">The next ownership check opens {formatCountdown(recheckAt, now)}.</p>
      ) : null}
      {isAuthor && canRelease && !lockOpen && lockEnds !== null ? (
        <p className="small mute">Your bond stays locked for {formatDuration(Number(config.bond_lock_seconds))} after registration so a challenge can still slash it. It unlocks {formatCountdown(lockEnds, now)}.</p>
      ) : null}
      {!isAuthor && work.status === "ACTIVE" && !windowOpen ? (
        <p className="small mute">The {formatDuration(Number(config.challenge_window_seconds))} challenge window has closed, so this work can no longer be disputed.</p>
      ) : null}
      {!isAuthor && work.status === "UNDER_DISPUTE" ? <p className="small mute">This work already has an open dispute; only one can run at a time.</p> : null}
      {challenging ? (
        <>
          <BlacklistBanner />
          <ChallengeForm work={work} onDone={() => setChallenging(false)} />
        </>
      ) : null}
    </article>
  );
}
