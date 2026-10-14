import { useMemo, useState } from "react";
import { read } from "../chain.js";
import { useApp, useRead } from "../hooks.jsx";
import { Addr, Button, CopyText, Link, Loading } from "../components/ui.jsx";
import { CONTRACT_ADDRESS, CONTRACT_EXPLORER_LINK } from "../config.js";
import { OUTCOME_TEXT, OUTCOME_VERDICT, bpsShare, formatDuration, formatGen } from "../format.js";
import { METHODS, RULES } from "../contract/methods.js";
import SOURCE from "../contract/AuthorshipRegistry.py?raw";

const PREVIEW_LINES = 70;

function Source() {
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => SOURCE.split("\n"), []);
  const index = useMemo(() => {
    const found = {};
    lines.forEach((line, i) => {
      const m = line.match(/^\s+def ([a-z]\w*)\(/);
      if (m && !m[1].startsWith("_") && !(m[1] in found)) found[m[1]] = i + 1;
    });
    return found;
  }, [lines]);

  const jump = (name) => {
    setOpen(true);
    setTimeout(() => document.getElementById(`src-line-${index[name]}`)?.scrollIntoView({ block: "center" }), 60);
  };
  const download = () => {
    const blob = new Blob([SOURCE], { type: "text/x-python" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "AuthorshipRegistry.py";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const shown = open ? lines : lines.slice(0, PREVIEW_LINES);

  return (
    <div className="block" id="source">
      <h2 className="h2">Contract source</h2>
      <p className="small mute">
        This is the exact file this site expects{CONTRACT_ADDRESS ? <> at <span className="mono">{CONTRACT_ADDRESS}</span></> : " (no address set yet)"}: {lines.length} lines of GenLayer Python. Redeploy it from GenLayer Studio, or read it here.
      </p>
      <div className="actions">
        <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(SOURCE)}>Copy source</Button>
        <Button variant="secondary" onClick={download}>Download .py</Button>
        <label className="small mute" htmlFor="jump">Jump to</label>
        <select id="jump" defaultValue="" onChange={(e) => e.target.value && jump(e.target.value)}>
          <option value="">Method…</option>
          {Object.keys(index).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <pre className="source" tabIndex={0} aria-label="Contract source code">
        {shown.map((line, i) => {
          const t = line.trim();
          const cls = t.startsWith("#") ? "ln-comment" : /^(def|class|@gl\.|@allow)/.test(t) ? "ln-key" : "";
          return (
            <span key={i} id={`src-line-${i + 1}`} className={`ln ${cls}`}>
              <span className="ln-no">{i + 1}</span>
              {line || " "}
              {"\n"}
            </span>
          );
        })}
      </pre>
      <div className="actions">
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? "Collapse source" : `Show all ${lines.length} lines`}</Button>
      </div>
    </div>
  );
}

export default function Contract() {
  const { config, admin } = useApp();
  const [kind, setKind] = useState("all");
  const stats = useRead(() => read("get_registry_stats"), []);
  const methods = METHODS.filter((m) => kind === "all" || m.kind === kind);

  return (
    <section>
      <h1 className="h1">The contract</h1>
      <p className="lede">Everything the app does is a call to one GenLayer Intelligent Contract. Its rules, its numbers and its full source are here, so nothing about a ruling has to be taken on trust.</p>

      <div className="block">
        <h2 className="h2">Deployment</h2>
        <dl className="facts">
          <div className="wide"><dt>Address</dt><dd><CopyText text={CONTRACT_ADDRESS} /></dd></div>
          <div><dt>Network</dt><dd>GenLayer Studio</dd></div>
          <div><dt>Admin</dt><dd><Addr value={admin} /></dd></div>
          <div><dt>Explorer</dt><dd><Link href={CONTRACT_EXPLORER_LINK}>Open contract</Link></dd></div>
          {stats.data ? <div><dt>Works / disputes</dt><dd>{stats.data.total_works} / {stats.data.total_disputes}</dd></div> : null}
        </dl>
        {stats.loading ? <Loading /> : null}
      </div>

      <div className="block">
        <h2 className="h2">Who decides what</h2>
        <p className="small mute">The model never gives a verdict. It only reports facts, and plain contract code applies the rules.</p>
        <table className="table">
          <thead><tr><th>{RULES[0][0]}</th><th>{RULES[0][1]}</th></tr></thead>
          <tbody>{RULES.slice(1).map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
        <p className="small mute">The burden of proof is on the challenger: unreadable pages, missing proof tags, dates without an archive capture and near ties never win a dispute. A challenger who loses on the merits cannot dispute the same work again.</p>
      </div>

      <div className="block">
        <h2 className="h2">Outcome codes</h2>
        <table className="table">
          <thead><tr><th>Code</th><th>Verdict</th><th>Meaning</th></tr></thead>
          <tbody>
            {Object.keys(OUTCOME_TEXT).map((c) => (
              <tr key={c}><td className="mono">{c}</td><td>{OUTCOME_VERDICT[c]}</td><td>{OUTCOME_TEXT[c]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="block">
        <h2 className="h2">Money and timing (live from the contract)</h2>
        <table className="table">
          <tbody>
            <tr><td>Registration bond</td><td>at least {formatGen(config.registration_bond_wei)} GEN, locked for {formatDuration(Number(config.bond_lock_seconds))}</td></tr>
            <tr><td>Challenge stake</td><td>at least {formatGen(config.challenge_stake_wei)} GEN</td></tr>
            <tr><td>Challenge upheld</td><td>challenger gets the stake back plus {Number(config.challenger_bounty_bps) / 100}% of the author's bond; the rest of the bond goes to the pool</td></tr>
            <tr><td>Challenge rejected</td><td>author gets {Number(config.author_share_bps) / 100}% of the stake ({formatGen(bpsShare(config.challenge_stake_wei, config.author_share_bps))} GEN at the minimum); the rest goes to the pool</td></tr>
            <tr><td>Withdraw a dispute</td><td>stake back minus {Number(config.withdraw_fee_bps) / 100}%</td></tr>
            <tr><td>Last undecided round</td><td>after {config.max_resolution_attempts} rounds the dispute closes and the stake returns minus {Number(config.inconclusive_fee_bps) / 100}%</td></tr>
            <tr><td>Keeper reward</td><td>{formatGen(config.keeper_reward_wei)} GEN for a passing ownership check</td></tr>
            <tr><td>Resolver reward</td><td>{formatGen(config.resolver_reward_wei)} GEN for a decisive ruling</td></tr>
            <tr><td>Author response window</td><td>{formatDuration(Number(config.response_window_seconds))}</td></tr>
            <tr><td>Challenge window</td><td>{formatDuration(Number(config.challenge_window_seconds))} after registration</td></tr>
            <tr><td>Cooldowns</td><td>{formatDuration(Number(config.ownership_recheck_cooldown_seconds))} between ownership checks, {formatDuration(Number(config.resolution_cooldown_seconds))} between resolution rounds</td></tr>
            <tr><td>Minimum priority gap</td><td>{formatDuration(Number(config.min_priority_gap_seconds))}</td></tr>
            <tr><td>Content types</td><td>{(config.content_types || []).join(", ")}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="block">
        <h2 className="h2">Methods</h2>
        <div className="tabs" role="tablist" aria-label="Method kind">
          {[["all", "All"], ["write", "Writes"], ["read", "Reads"]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "tab on" : "tab"} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
        <table className="table">
          <thead><tr><th>Method</th><th>Who</th><th>What it does</th></tr></thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.name}>
                <td><span className="mono">{m.name}</span><br /><span className="small mute mono">{m.args ? `(${m.args})` : "()"}</span></td>
                <td>{m.kind === "read" ? "Read only" : m.who}{m.payable ? <><br /><span className="small mute">{m.payable}</span></> : null}</td>
                <td>{m.doc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Source />
    </section>
  );
}
