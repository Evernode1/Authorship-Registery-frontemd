import { useState } from "react";
import { addr, read } from "../chain.js";
import { useApp, useNav, useRead } from "../hooks.jsx";
import { Addr, BlacklistBanner, Button, ConfirmButton, Empty, Field, Loading, Notice, ProofToken } from "../components/ui.jsx";
import { attachWorks, loadDisputesAgainst } from "../loaders.js";
import { clean, disputeState, formatCountdown, formatGen, isAddress, nowEpoch, parseGen, sameAddr } from "../format.js";

const ZERO = "0x0000000000000000000000000000000000000000";

function Money({ label, wei }) {
  return <div><dt>{label}</dt><dd>{formatGen(wei)} GEN</dd></div>;
}

/** Disputes that are waiting on this wallet right now. */
function Attention({ account }) {
  const { config } = useApp();
  const nav = useNav();
  const { data, loading } = useRead(async () => {
    const [against, opened] = await Promise.all([
      loadDisputesAgainst(account),
      read("list_disputes_by_challenger", [addr(account)]).then((l) => attachWorks([...l].reverse())),
    ]);
    return { against, opened };
  }, [account]);
  if (loading) return <Loading />;
  const now = nowEpoch();
  const items = [];
  for (const { d, work } of data?.against ?? []) {
    const st = disputeState(d, config, now);
    if (st.canRespond) items.push({ key: `r${d.dispute_id}`, text: `Dispute #${d.dispute_id} on "${work?.title}" needs your response. The window closes ${formatCountdown(st.deadline, now)}.` });
    else if (st.isOpen) items.push({ key: `a${d.dispute_id}`, text: `Dispute #${d.dispute_id} on "${work?.title}" is open${st.canResolve ? " and ready to resolve" : ""}.` });
  }
  for (const { d, work } of data?.opened ?? []) {
    const st = disputeState(d, config, now);
    if (st.isOpen) items.push({ key: `c${d.dispute_id}`, text: `Your dispute #${d.dispute_id} on "${work?.title}" is open${st.canResolve ? " and ready to resolve" : st.cooling ? `; the next round opens ${formatCountdown(st.nextRound, now)}` : ", waiting for the author or the response window"}.` });
  }
  if (!items.length) return <p className="mute">Nothing is waiting on you.</p>;
  return (
    <>
      <ul className="attention">
        {items.map((i) => <li key={i.key}>{i.text}</li>)}
      </ul>
      <div className="actions"><Button variant="secondary" onClick={() => nav?.openDisputes("against")}>Open disputes</Button></div>
    </>
  );
}

function BlacklistCheck() {
  const [target, setTarget] = useState("");
  const [state, setState] = useState(null);
  const ok = isAddress(target);
  return (
    <div className="form">
      <Field label="Check an address"><input className="mono" value={target} onChange={(e) => { setTarget(e.target.value); setState(null); }} placeholder="0x…" /></Field>
      <div className="actions">
        <Button
          variant="quiet"
          disabled={!ok}
          onClick={async () => {
            try {
              setState(await read("get_blacklist_status", [addr(clean(target))]));
            } catch {
              setState({ error: true });
            }
          }}
        >
          Check blacklist status
        </Button>
      </div>
      {state && !state.error ? <Notice tone={state.blacklisted ? "rust" : "moss"}>{state.blacklisted ? `Blacklisted. Reason: ${state.reason || "none given"}` : "Not blacklisted."}</Notice> : null}
      {state?.error ? <Notice tone="rust">Could not read the status.</Notice> : null}
    </div>
  );
}

function AdminPanel() {
  const { send, busy, admin } = useApp();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [next, setNext] = useState("");
  const okAddr = isAddress(target);
  const okNext = isAddress(next) && clean(next).toLowerCase() !== ZERO;
  return (
    <div className="block">
      <h2 className="h2">Admin</h2>
      <p className="small mute">You are the registry admin ({<Addr value={admin} plain />}). Admins can blacklist or reinstate an address and hand the role over. They cannot change outcomes, edit records or move funds.</p>
      <div className="form">
        <Field label="Address"><input className="mono" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0x…" /></Field>
        <Field label="Reason for blacklisting (3 to 300 characters)"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        <div className="actions">
          <Button variant="secondary" busy={busy} disabled={!okAddr || clean(reason).length < 3} onClick={() => send("Blacklist address", "blacklist_address", [addr(clean(target)), clean(reason)])}>Blacklist</Button>
          <Button variant="secondary" busy={busy} disabled={!okAddr} onClick={() => send("Reinstate address", "unblacklist_address", [addr(clean(target))])}>Reinstate</Button>
        </div>
      </div>
      <h3 className="h3">Hand over the admin role</h3>
      <div className="form">
        <Field label="New admin address" hint="You lose admin rights as soon as this goes through. The zero address is refused."><input className="mono" value={next} onChange={(e) => setNext(e.target.value)} placeholder="0x…" /></Field>
        <div className="actions">
          <ConfirmButton
            label="Transfer admin role"
            confirmLabel="Transfer admin role"
            busy={busy}
            disabled={!okNext}
            message={`${clean(next)} becomes the admin and you stop being the admin. Only the new admin can undo this.`}
            onConfirm={() => send("Transfer admin", "transfer_admin", [addr(clean(next))])}
          />
        </div>
      </div>
    </div>
  );
}

export default function Account() {
  const { account, connect, send, busy, isAdmin, admin, config } = useApp();
  const [fund, setFund] = useState("");

  const mine = useRead(async () => {
    if (!account) return null;
    const [balance, stats] = await Promise.all([
      read("get_balance", [addr(account)]),
      read("get_author_stats", [addr(account)]),
    ]);
    return { balance: String(balance ?? "0"), stats };
  }, [account]);

  const registry = useRead(async () => {
    const [accounting, stats] = await Promise.all([read("get_accounting"), read("get_registry_stats")]);
    return { accounting, stats };
  }, []);

  const fundWei = parseGen(fund);
  const bal = mine.data?.balance ?? "0";

  return (
    <section>
      <h1 className="h1">Account</h1>

      {!account ? (
        <Empty title="Connect a wallet to see your balance and proof token.">
          <Button onClick={connect}>Connect wallet</Button>
        </Empty>
      ) : (
        <>
          <BlacklistBanner />
          <div className="block">
            <h2 className="h2">Your wallet</h2>
            <p className="mono break">{account}</p>
            <p className="small">Your challenger tag, as issued by the contract. Put it inside the HTML head of an earlier page you want to use in a dispute. (Authors verify a registration with the tag shown on that work in Works.)</p>
            <ProofToken address={account} />
          </div>

          <div className="block">
            <h2 className="h2">Waiting on you</h2>
            <Attention account={account} />
          </div>

          <div className="block">
            <h2 className="h2">Payouts waiting for you</h2>
            {mine.loading ? <Loading /> : null}
            {mine.error ? <Notice tone="rust">{mine.error}</Notice> : null}
            {mine.data ? (
              <>
                <p className="big">{formatGen(bal)} GEN</p>
                <div className="actions">
                  <Button busy={busy} disabled={BigInt(bal || "0") === 0n} onClick={() => send("Withdraw", "withdraw")}>Withdraw to wallet</Button>
                </div>
                <dl className="facts">
                  <div><dt>Works registered</dt><dd>{mine.data.stats?.works_registered ?? 0}</dd></div>
                  <div><dt>Challenges survived</dt><dd>{mine.data.stats?.defenses_survived ?? 0}</dd></div>
                  <div><dt>Works overturned</dt><dd>{mine.data.stats?.works_overturned ?? 0}</dd></div>
                  <div><dt>Disputes opened</dt><dd>{mine.data.stats?.disputes_opened ?? 0}</dd></div>
                  <div><dt>Upheld / rejected</dt><dd>{mine.data.stats?.disputes_upheld ?? 0} / {mine.data.stats?.disputes_rejected ?? 0}</dd></div>
                </dl>
              </>
            ) : null}
          </div>
          {isAdmin ? <AdminPanel /> : null}
        </>
      )}

      <div className="block">
        <h2 className="h2">Registry</h2>
        {registry.loading ? <Loading /> : null}
        {registry.error ? <Notice tone="rust">{registry.error}</Notice> : null}
        {registry.data ? (
          <>
            <dl className="facts">
              <div><dt>Works</dt><dd>{registry.data.stats?.total_works ?? 0}</dd></div>
              <div><dt>Disputes</dt><dd>{registry.data.stats?.total_disputes ?? 0}</dd></div>
              <div><dt>Upheld / rejected</dt><dd>{registry.data.stats?.disputes_upheld ?? 0} / {registry.data.stats?.disputes_rejected ?? 0}</dd></div>
              <Money label="Reward pool" wei={registry.data.accounting?.reward_pool} />
              <Money label="Bonds locked" wei={registry.data.accounting?.locked_bonds} />
              <Money label="Stakes held" wei={registry.data.accounting?.open_stakes} />
              <Money label="Awaiting withdrawal" wei={registry.data.accounting?.pending_withdrawals} />
              <Money label="Total deposited" wei={registry.data.accounting?.total_deposited} />
              <Money label="Total withdrawn" wei={registry.data.accounting?.total_withdrawn} />
              <div><dt>Admin</dt><dd><Addr value={admin} />{sameAddr(admin, account) ? " (you)" : ""}</dd></div>
            </dl>
            <p className="small">
              {registry.data.accounting?.balanced
                ? "The books balance: pool, bonds, stakes and pending payouts equal deposits minus withdrawals."
                : "The books do not balance. Do not send funds until this is explained."}
            </p>
          </>
        ) : null}
        <p className="small mute">
          The pool pays {formatGen(config.keeper_reward_wei)} GEN to whoever runs a passing ownership check and {formatGen(config.resolver_reward_wei)} GEN to whoever triggers a decisive ruling. It is topped up by forfeited stakes, slashed bonds and fees, and anyone can add to it.
        </p>
        <div className="form inline">
          <Field label="Amount in GEN">
            <input value={fund} onChange={(e) => setFund(e.target.value)} inputMode="decimal" placeholder="0.01" />
          </Field>
          <Button variant="secondary" busy={busy} disabled={!fundWei || fundWei <= 0n} onClick={() => send("Fund reward pool", "fund_rewards", [], fundWei)}>Add to pool</Button>
        </div>
      </div>

      <div className="block">
        <h2 className="h2">Blacklist lookup</h2>
        <p className="small mute">Anyone can check whether an address is blacklisted and why.</p>
        <BlacklistCheck />
      </div>
    </section>
  );
}
