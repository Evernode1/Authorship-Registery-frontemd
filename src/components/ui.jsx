import { useEffect, useState } from "react";
import { useApp, useNav } from "../hooks.jsx";
import { addr as addrArg, read } from "../chain.js";
import { CONTRACT_EXPLORER_LINK } from "../config.js";
import { metaTag, proofToken, shortAddr } from "../format.js";

const STATUS_LABEL = {
  ACTIVE: "Active",
  UNDER_DISPUTE: "Under dispute",
  OVERTURNED: "Overturned",
  WITHDRAWN: "Withdrawn",
  OPEN: "Open",
  UPHELD: "Challenge upheld",
  REJECTED: "Challenge rejected",
  CLOSED_INCONCLUSIVE: "Closed, no ruling",
  VERIFIED: "Ownership verified",
  UNVERIFIED: "Ownership unverified",
  UNVERIFIED_CLAIM: "Unverified claim",
  OWNERSHIP_VERIFIED: "Ownership verified",
  ESTABLISHED: "Established author",
};
const STATUS_TONE = {
  ACTIVE: "moss", UNDER_DISPUTE: "amber", OVERTURNED: "rust", WITHDRAWN: "mute",
  OPEN: "amber", UPHELD: "rust", REJECTED: "moss", CLOSED_INCONCLUSIVE: "mute",
  VERIFIED: "moss", UNVERIFIED: "mute",
  UNVERIFIED_CLAIM: "amber", OWNERSHIP_VERIFIED: "moss", ESTABLISHED: "moss",
};

export function Pill({ status, tone, children }) {
  return <span className={`pill pill-${tone || STATUS_TONE[status] || "mute"}`}>{children ?? (STATUS_LABEL[status] || status)}</span>;
}

export function Button({ variant = "primary", busy, disabled, children, ...rest }) {
  return (
    <button className={`btn btn-${variant}`} disabled={busy || disabled} {...rest}>
      {children}
    </button>
  );
}

/** Two-step button for actions that cost money or cannot be undone. */
export function ConfirmButton({ label, confirmLabel = "Confirm", message, onConfirm, busy, disabled, title, variant = "secondary" }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant={variant} busy={busy} disabled={disabled} title={title} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="confirm" role="group" aria-label={label}>
      <p className="small">{message}</p>
      <div className="actions">
        <Button
          busy={busy}
          onClick={async () => {
            setOpen(false);
            await onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function CopyText({ text, children }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      title="Copy"
    >
      <span className="mono">{children ?? text}</span>
      <span className="copy-state">{done ? "Copied" : "Copy"}</span>
    </button>
  );
}

/**
 * The proof tag to copy into the HTML head of a page. With workId it is the author's tag for that
 * registration (get_work_proof, bound to the author and the work number). Without it, it is the
 * challenger's tag for an address (get_expected_proof). Shown as the full <meta> tag, because
 * the contract only accepts the token inside <meta name="oar-proof"> in the head.
 */
export function ProofToken({ address, workId }) {
  const fallback = workId ? "" : proofToken(address);
  const [token, setToken] = useState(fallback);
  useEffect(() => {
    let live = true;
    setToken(fallback);
    const call = workId ? read("get_work_proof", [workId]) : address ? read("get_expected_proof", [addrArg(address)]) : null;
    if (call) {
      call.then((t) => live && typeof t === "string" && t && setToken(t)).catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [address, workId, fallback]);
  if (!token) return <span className="small mute">Loading the tag…</span>;
  return <CopyText text={metaTag(token)} />;
}

/** Address; click to open that address's page (stats, works, disputes). */
export function Addr({ value, plain = false }) {
  const nav = useNav();
  if (!value) return <span className="mute">None</span>;
  if (plain || !nav) return <span className="mono" title={value}>{shortAddr(value)}</span>;
  return (
    <button type="button" className="addr-link mono" title={`${value}: view this address`} onClick={() => nav.openProfile(value)}>
      {shortAddr(value)}
    </button>
  );
}

export function Notice({ tone = "mute", children }) {
  return <p className={`notice notice-${tone}`}>{children}</p>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children ? <p className="empty-body">{children}</p> : null}
    </div>
  );
}

export function Loading({ children = "Loading from the contract…" }) {
  return <p className="mute loading" role="status">{children}</p>;
}

export function Link({ href, children }) {
  return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
}

/** Shown when the connected wallet is blacklisted, with the admin's stated reason. */
export function BlacklistBanner() {
  const { status } = useApp();
  if (!status.blacklisted) return null;
  return (
    <Notice tone="rust">
      This wallet is blacklisted, so it cannot register, open disputes or have ownership checked. It can still respond to disputes already opened against it, withdraw payouts and release bonds.
      {status.reason ? ` Reason given: ${status.reason}` : ""}
    </Notice>
  );
}

/** Fixed progress bar for the transaction in flight. */
export function TxBar() {
  const { tx, setTx } = useApp();
  if (!tx) return null;
  const waiting = tx.phase === "wallet" || tx.phase === "consensus";
  let text;
  if (tx.phase === "wallet") text = `${tx.label}: confirm in your wallet.`;
  else if (tx.phase === "consensus") text = `${tx.label}: waiting for validators to agree. Rounds that read web pages can take a few minutes.`;
  else if (tx.phase === "done") text = tx.note ? `${tx.label}: confirmed on chain. ${tx.note}` : `${tx.label}: done.`;
  else text = `${tx.label} failed. ${tx.error}`;
  return (
    <div className={`txbar txbar-${tx.phase}`} role={tx.phase === "error" ? "alert" : "status"}>
      <p>{text}</p>
      {tx.hash ? (
        <p className="txbar-hash">
          <span className="mono">{tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}</span>{" "}
          <Link href={CONTRACT_EXPLORER_LINK}>Contract on explorer</Link>
        </p>
      ) : null}
      {!waiting ? <button className="btn btn-quiet" onClick={() => setTx(null)}>Dismiss</button> : null}
    </div>
  );
}
