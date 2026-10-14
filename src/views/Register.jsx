import { useState } from "react";
import { useApp, useNav, useUrlPreview } from "../hooks.jsx";
import { Addr, BlacklistBanner, Button, Field, Notice } from "../components/ui.jsx";
import { clean, formatGen, sameAddr, sha256Hex } from "../format.js";

function FingerprintHelper({ onUse }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="helper">
      <summary>Compute a fingerprint from your text</summary>
      <p className="small mute">Paste the exact content. The sha256 is computed in your browser and never leaves it.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      <div className="actions">
        <Button
          type="button"
          variant="secondary"
          busy={busy}
          disabled={!text}
          onClick={async () => {
            setBusy(true);
            try {
              onUse(await sha256Hex(text));
            } finally {
              setBusy(false);
            }
          }}
        >
          Use this fingerprint
        </Button>
      </div>
    </details>
  );
}

export default function Register({ initialUrl }) {
  const { config, send, busy, account, status } = useApp();
  const nav = useNav();
  const [url, setUrl] = useState(initialUrl || "");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("ARTICLE");
  const [fingerprint, setFingerprint] = useState("");
  const [registered, setRegistered] = useState(false);
  const preview = useUrlPreview(url);

  const fp = clean(fingerprint).toLowerCase();
  const fpOk = fp === "" || /^[0-9a-f]{64}$/.test(fp);
  // A withdrawn link is freed by the contract, so any record returned here still holds the link
  // (that includes overturned works, which keep the link indexed).
  const taken = !!preview.existing;
  const mine = taken && sameAddr(preview.existing.author, account);
  const valid = !preview.error && !status.blacklisted && clean(url).length >= 10 && clean(title).length >= 1 && clean(title).length <= 120 && fpOk && !taken;

  return (
    <section>
      <h1 className="h1">Register a link</h1>
      <p className="lede">Registering puts your name on a link and starts the {Math.round(Number(config.challenge_window_seconds) / 86400)}-day window in which others can challenge it. Registering does not prove you wrote it first. Only the earliest publication date does.</p>
      <BlacklistBanner />

      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await send("Register link", "register_work", [clean(url), clean(title), type, fp], BigInt(config.registration_bond_wei));
          if (ok) {
            setRegistered(true);
            setUrl("");
            setTitle("");
            setFingerprint("");
          }
        }}
      >
        <Field label="Link" hint={preview.canonical ? `Stored as ${preview.canonical}` : "Public https address of your post, article, repo or video"}>
          <input value={url} onChange={(e) => { setUrl(e.target.value); setRegistered(false); }} maxLength={300} required placeholder="https://medium.com/@you/your-essay" />
        </Field>
        {preview.error ? <Notice tone="rust">{preview.error}</Notice> : null}
        {taken ? (
          <Notice tone="amber">
            {mine ? "You already registered this link" : <>This link is already registered by <Addr value={preview.existing.author} /></>} as work #{preview.existing.work_id}
            {preview.existing.status === "OVERTURNED" ? ", but that registration was overturned in a dispute" : ""}.{" "}
            {nav ? <button type="button" className="addr-link" onClick={() => nav.openLookup(url)}>{mine ? "Look it up" : "Look it up to challenge it or see who holds priority"}</button> : null}
          </Notice>
        ) : null}

        <Field label="Title" hint={`${clean(title).length}/120`}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </Field>
        <Field label="What it is">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {(config.content_types || []).map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
          </select>
        </Field>
        <Field label="Content fingerprint (optional)" hint={fpOk ? "A sha256 of your content, 64 hex characters. Informational only." : "Must be empty or exactly 64 hex characters."}>
          <input value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} maxLength={64} spellCheck="false" className="mono" />
        </Field>
        <FingerprintHelper onUse={setFingerprint} />

        <p className="small mute">Bond: {formatGen(config.registration_bond_wei)} GEN, locked for the challenge window. If a challenge against you is upheld, {Number(config.challenger_bounty_bps) / 100}% goes to the challenger and the rest to the reward pool. You can release it after the lock ends.</p>
        <div className="actions">
          <Button type="submit" busy={busy} disabled={!valid}>{account ? "Register and lock bond" : "Connect wallet and register"}</Button>
        </div>
        {registered ? (
          <div className="inset">
            <Notice tone="moss">Registered as an unverified claim. To verify ownership, open Works: it shows the exact tag for this registration to put in your page's HTML head, then press Verify ownership.</Notice>
            {nav ? <div className="actions"><Button variant="secondary" onClick={() => nav.openWorks("mine")}>Go to my works</Button></div> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
