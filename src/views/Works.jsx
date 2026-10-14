import { useState } from "react";
import { addr, read, readNewest } from "../chain.js";
import { useApp, useNav, useRead } from "../hooks.jsx";
import { Button, Empty, Loading, Notice } from "../components/ui.jsx";
import WorkRow from "../components/WorkRow.jsx";
import { loadWorksBy } from "../loaders.js";

const STATUSES = [["", "Any status"], ["ACTIVE", "Active"], ["UNDER_DISPUTE", "Under dispute"], ["OVERTURNED", "Overturned"], ["WITHDRAWN", "Withdrawn"]];
const STEP = 20;

export default function Works({ initialScope = "all", onRegister }) {
  const { account, connect } = useApp();
  const nav = useNav();
  const [scope, setScope] = useState(initialScope);
  const [statusFilter, setStatusFilter] = useState("");
  const [count, setCount] = useState(STEP);

  const { data, loading, error } = useRead(async () => {
    if (scope === "mine") {
      if (!account) return { works: [], total: 0 };
      const works = await loadWorksBy(account, count);
      const stats = await read("get_author_stats", [addr(account)]).catch(() => null);
      return { works, total: Number(stats?.works_registered ?? works.length) };
    }
    const stats = await read("get_registry_stats");
    const total = Number(stats?.total_works || 0);
    return { works: total ? await readNewest("list_works", total, count) : [], total };
  }, [scope, count, account]);

  const works = (data?.works ?? []).filter((w) => !statusFilter || w.status === statusFilter);
  const more = data && data.total > (data.works?.length ?? 0);

  return (
    <section>
      <h1 className="h1">Works</h1>
      <div className="tabs" role="tablist" aria-label="Which works">
        <button role="tab" aria-selected={scope === "all"} className={scope === "all" ? "tab on" : "tab"} onClick={() => { setScope("all"); setCount(STEP); }}>All registered</button>
        <button role="tab" aria-selected={scope === "mine"} className={scope === "mine" ? "tab on" : "tab"} onClick={() => { setScope("mine"); setCount(STEP); }}>My works</button>
      </div>
      <div className="filters">
        <label className="small mute" htmlFor="work-status">Show</label>
        <select id="work-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        {data ? <span className="small mute">{data.total} in total</span> : null}
      </div>

      {scope === "mine" && !account ? (
        <Empty title="Connect a wallet to see your works.">
          <Button variant="secondary" onClick={connect}>Connect wallet</Button>
        </Empty>
      ) : null}

      {loading ? <Loading /> : null}
      {error ? <Notice tone="rust">{error}</Notice> : null}

      {data && works.length === 0 && !(scope === "mine" && !account) ? (
        <Empty title={statusFilter ? "No loaded works match that status." : scope === "mine" ? "You have not registered anything yet." : "Nothing has been registered yet."}>
          {statusFilter && more ? "Older works are not loaded yet. Load more below." : <Button variant="secondary" onClick={() => onRegister("")}>Register a link</Button>}
        </Empty>
      ) : null}

      {works.map((w) => <WorkRow key={w.work_id} work={w} />)}

      {more ? (
        <div className="actions">
          <Button variant="secondary" busy={loading} onClick={() => setCount((c) => c + STEP)}>Show older works</Button>
          <span className="small mute">Showing {data.works.length} of {data.total}</span>
        </div>
      ) : null}
      {nav ? <p className="small mute">Know a work's number? Use "Open by number" on the lookup page.</p> : null}
    </section>
  );
}
