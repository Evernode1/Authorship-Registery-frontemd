import { useState } from "react";
import { addr, read } from "../chain.js";
import { useApp, useRead } from "../hooks.jsx";
import { Addr, Button, CopyText, Empty, Field, Loading, Notice, Pill } from "../components/ui.jsx";
import WorkRow from "../components/WorkRow.jsx";
import DisputeRow from "../components/DisputeRow.jsx";
import { attachWorks, loadWorksBy } from "../loaders.js";
import { clean, formatGen, isAddress, sameAddr } from "../format.js";

export default function Profile({ initialAddress = "" }) {
  const { account, admin } = useApp();
  const [input, setInput] = useState(initialAddress);
  const [submitted, setSubmitted] = useState(isAddress(initialAddress) ? initialAddress : "");
  const valid = isAddress(input);

  const { data, loading, error } = useRead(async () => {
    if (!submitted) return null;
    const [stats, blacklist, balance, works, opened] = await Promise.all([
      read("get_author_stats", [addr(submitted)]),
      read("get_blacklist_status", [addr(submitted)]),
      read("get_balance", [addr(submitted)]),
      loadWorksBy(submitted, 20),
      read("list_disputes_by_challenger", [addr(submitted)]),
    ]);
    const disputes = await attachWorks([...opened].reverse());
    return { stats, blacklist, balance: String(balance ?? "0"), works, disputes };
  }, [submitted]);

  const s = data?.stats;
  return (
    <section>
      <h1 className="h1">Address</h1>
      <p className="lede">Look up any wallet: its record as an author and as a challenger, whether it is blacklisted, and everything it registered or disputed.</p>
      <form
        className="form inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setSubmitted(clean(input));
        }}
      >
        <Field label="Wallet address">
          <input className="mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x…" spellCheck="false" />
        </Field>
        <Button type="submit" disabled={!valid}>Look up</Button>
        {account ? <Button type="button" variant="quiet" onClick={() => { setInput(account); setSubmitted(account); }}>Use my wallet</Button> : null}
      </form>
      {input && !valid ? <p className="small mute">An address is 0x followed by 40 hex characters.</p> : null}

      {!submitted ? <Empty title="Enter an address to see its record." /> : null}
      {loading && submitted ? <Loading /> : null}
      {error ? <Notice tone="rust">{error}</Notice> : null}

      {data ? (
        <div className="result">
          <div className="result-lead">
            <p className="small mute">Address</p>
            <CopyText text={submitted} />
            <div className="pills">
              {sameAddr(submitted, account) ? <Pill tone="moss">You</Pill> : null}
              {sameAddr(submitted, admin) ? <Pill tone="amber">Registry admin</Pill> : null}
              {data.blacklist?.blacklisted ? <Pill tone="rust">Blacklisted</Pill> : null}
            </div>
            {data.blacklist?.blacklisted && data.blacklist.reason ? <p className="small">Reason on record: {data.blacklist.reason}</p> : null}
          </div>

          <h2 className="h2">Record</h2>
          <dl className="facts">
            <div><dt>Works registered</dt><dd>{s?.works_registered ?? 0}</dd></div>
            <div><dt>Challenges survived</dt><dd>{s?.defenses_survived ?? 0}</dd></div>
            <div><dt>Works overturned</dt><dd>{s?.works_overturned ?? 0}</dd></div>
            <div><dt>Disputes opened</dt><dd>{s?.disputes_opened ?? 0}</dd></div>
            <div><dt>Upheld / rejected</dt><dd>{s?.disputes_upheld ?? 0} / {s?.disputes_rejected ?? 0}</dd></div>
            <div><dt>Payouts waiting</dt><dd>{formatGen(data.balance)} GEN</dd></div>
          </dl>

          <h2 className="h2">Works</h2>
          {data.works.length ? data.works.map((w) => <WorkRow key={w.work_id} work={w} compact />) : <p className="mute">No works registered.</p>}
          {Number(s?.works_registered || 0) > data.works.length ? <p className="small mute">Showing the newest {data.works.length} of {s.works_registered}.</p> : null}

          <h2 className="h2">Disputes opened</h2>
          {data.disputes.length ? data.disputes.map(({ d, work }) => <DisputeRow key={d.dispute_id} dispute={d} work={work} />) : <p className="mute">No disputes opened.</p>}
        </div>
      ) : null}
    </section>
  );
}
