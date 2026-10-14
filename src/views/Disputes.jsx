import { useState } from "react";
import { addr, read, readNewest } from "../chain.js";
import { useApp, useRead } from "../hooks.jsx";
import { Button, Empty, Loading, Notice } from "../components/ui.jsx";
import DisputeRow from "../components/DisputeRow.jsx";
import { attachWorks, loadDisputesAgainst } from "../loaders.js";
import { disputeState, nowEpoch, sameAddr } from "../format.js";

const STEP = 20;
const TABS = [
  ["action", "Needs action"],
  ["open", "Open"],
  ["settled", "Settled"],
  ["all", "All"],
  ["mine", "Ones I opened"],
  ["against", "Against my works"],
];

export default function Disputes({ initialFilter = "open" }) {
  const { account, connect, config } = useApp();
  const [filter, setFilter] = useState(initialFilter);
  const [count, setCount] = useState(STEP);

  const { data, loading, error } = useRead(async () => {
    if (filter === "mine") {
      if (!account) return { rows: [], total: 0, loaded: 0 };
      const list = [...(await read("list_disputes_by_challenger", [addr(account)]))].reverse();
      return { rows: await attachWorks(list), total: list.length, loaded: list.length };
    }
    if (filter === "against") {
      if (!account) return { rows: [], total: 0, loaded: 0 };
      const rows = await loadDisputesAgainst(account);
      return { rows, total: rows.length, loaded: rows.length };
    }
    const stats = await read("get_registry_stats");
    const total = Number(stats?.total_disputes || 0);
    const list = total ? await readNewest("list_disputes", total, count) : [];
    return { rows: await attachWorks(list), total, loaded: list.length };
  }, [filter, account, count]);

  const now = nowEpoch();
  let rows = data?.rows ?? [];
  if (filter === "open") rows = rows.filter(({ d }) => d.status === "OPEN");
  if (filter === "settled") rows = rows.filter(({ d }) => d.status !== "OPEN");
  if (filter === "action") {
    rows = rows.filter(({ d, work }) => {
      const st = disputeState(d, config, now);
      const iMustRespond = st.canRespond && work && sameAddr(account, work.author);
      return st.isOpen && (iMustRespond || st.canResolve);
    });
  }
  const needsWallet = (filter === "mine" || filter === "against") && !account;
  const more = data && data.loaded < data.total && filter !== "mine" && filter !== "against";

  return (
    <section>
      <h1 className="h1">Disputes</h1>
      <div className="tabs" role="tablist" aria-label="Which disputes">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "tab on" : "tab"} onClick={() => { setFilter(k); setCount(STEP); }}>{label}</button>
        ))}
      </div>
      {filter === "action" ? (
        <p className="small mute">Open disputes where you can still respond as the author, or where a resolution round can be run now. Anyone can run a round; a decisive one pays the caller from the reward pool.</p>
      ) : null}

      {needsWallet ? (
        <Empty title={filter === "mine" ? "Connect a wallet to see disputes you opened." : "Connect a wallet to see disputes against your works."}>
          <Button variant="secondary" onClick={connect}>Connect wallet</Button>
        </Empty>
      ) : null}
      {loading ? <Loading /> : null}
      {error ? <Notice tone="rust">{error}</Notice> : null}
      {data && rows.length === 0 && !needsWallet ? (
        <Empty title="No disputes here.">
          {more ? "Older disputes are not loaded yet. Load more below." : "To challenge a work, look up its link and press Challenge this work."}
        </Empty>
      ) : null}
      {rows.map(({ d, work }) => <DisputeRow key={d.dispute_id} dispute={d} work={work} />)}
      {more ? (
        <div className="actions">
          <Button variant="secondary" busy={loading} onClick={() => setCount((c) => c + STEP)}>Load older disputes</Button>
          <span className="small mute">Loaded {data.loaded} of {data.total}</span>
        </div>
      ) : null}
    </section>
  );
}
