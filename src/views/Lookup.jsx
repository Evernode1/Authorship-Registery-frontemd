import { useEffect, useState } from "react";
import { read, errorMessage } from "../chain.js";
import { useApp, useRead } from "../hooks.jsx";
import { Addr, Button, CopyText, Empty, Field, Link, Loading, Notice, Pill } from "../components/ui.jsx";
import WorkRow from "../components/WorkRow.jsx";
import DisputeRow from "../components/DisputeRow.jsx";
import { clean, formatDate } from "../format.js";

async function lookup(url) {
  const canonical = await read("preview_canonical_url", [url]);
  const first = await read("get_first_author", [url]);
  if (!first || !first.first_author) return { canonical, none: true };
  const work = await read("get_work_by_url", [url]);
  const chain = await Promise.all((first.chain || []).map((id) => read("get_work", [id])));
  const disputes = work?.work_id ? await read("list_disputes_for_work", [work.work_id]) : [];
  return { canonical, first, work, chain, disputes };
}

/** Open a work or a dispute directly by its number. */
function NumberFinder({ initial }) {
  const [kind, setKind] = useState(initial?.kind || "work");
  const [number, setNumber] = useState(initial?.id ? String(initial.id) : "");
  const [submitted, setSubmitted] = useState(initial?.id ? { kind: initial.kind, id: Number(initial.id) } : null);
  const valid = /^[1-9]\d*$/.test(clean(number));

  const { data, loading, error } = useRead(async () => {
    if (!submitted) return null;
    if (submitted.kind === "work") {
      const work = await read("get_work", [submitted.id]);
      if (!work?.work_id) return { missing: true };
      const disputes = await read("list_disputes_for_work", [submitted.id]);
      return { work, disputes };
    }
    const d = await read("get_dispute", [submitted.id]);
    if (!d?.dispute_id) return { missing: true };
    const work = await read("get_work", [d.work_id]);
    return { dispute: d, work };
  }, [submitted?.kind, submitted?.id]);

  return (
    <div className="block" id="by-number">
      <h2 className="h2">Open by number</h2>
      <form
        className="form inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setSubmitted({ kind, id: Number(clean(number)) });
        }}
      >
        <Field label="What">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="work">Work</option>
            <option value="dispute">Dispute</option>
          </select>
        </Field>
        <Field label="Number">
          <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" placeholder="1" />
        </Field>
        <Button type="submit" variant="secondary" disabled={!valid}>Open</Button>
      </form>
      {submitted && loading ? <Loading /> : null}
      {error ? <Notice tone="rust">{error}</Notice> : null}
      {data?.missing ? <Notice>No {submitted.kind} with that number.</Notice> : null}
      {data?.work && !data.dispute ? (
        <>
          <WorkRow work={data.work} />
          {data.disputes?.map((d) => <DisputeRow key={d.dispute_id} dispute={d} work={data.work} />)}
        </>
      ) : null}
      {data?.dispute ? <DisputeRow dispute={data.dispute} work={data.work} /> : null}
    </div>
  );
}

export default function Lookup({ initialUrl, initialFind, onRegister }) {
  const { version } = useApp();
  const [input, setInput] = useState(initialUrl || "");
  const [submitted, setSubmitted] = useState(initialUrl || "");
  const [state, setState] = useState({ loading: false, error: null, data: null });

  useEffect(() => {
    if (!submitted) return undefined;
    let live = true;
    setState({ loading: true, error: null, data: null });
    lookup(submitted)
      .then((data) => live && setState({ loading: false, error: null, data }))
      .catch((e) => live && setState({ loading: false, error: errorMessage(e), data: null }));
    return () => {
      live = false;
    };
  }, [submitted, version]);

  const { loading, error, data } = state;
  const firstWork = data?.chain?.length ? data.chain[data.chain.length - 1] : null;
  const shareLink = submitted
    ? `${window.location.origin}${window.location.pathname}?url=${encodeURIComponent(submitted)}#lookup`
    : "";

  return (
    <section>
      <h1 className="hero">Who published this first?</h1>
      <form
        className="lookup"
        onSubmit={(e) => {
          e.preventDefault();
          const next = clean(input);
          setSubmitted(next);
          // Keep the address bar shareable.
          window.history.replaceState(null, "", `?url=${encodeURIComponent(next)}#lookup`);
        }}
      >
        <label className="sr-only" htmlFor="lookup-url">Link to look up</label>
        <input
          id="lookup-url"
          className="lookup-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste a link to a post, article, repo or video"
          autoComplete="off"
          spellCheck="false"
        />
        <Button type="submit" busy={loading} disabled={clean(input).length < 10}>Find first author</Button>
      </form>

      {!submitted ? (
        <p className="lede">
          Authors register a link with a small bond. If someone published the same content earlier, they can challenge it, and GenLayer validators compare both pages. The earlier publisher wins, and the ruling is made by contract code, not by a model's opinion.
        </p>
      ) : null}

      {loading ? <Loading /> : null}
      {error ? <Notice tone="rust">{error}</Notice> : null}

      {data?.none ? (
        <Empty title="Nobody has registered this link yet.">
          <span className="small mute break">Stored as {data.canonical}</span>
          <br />
          <Button variant="secondary" onClick={() => onRegister(submitted)}>Register it</Button>
        </Empty>
      ) : null}

      {data && !data.none ? (
        <div className="result">
          <div className="result-lead">
            <p className="small mute">{data.first.authorship_tier === "UNVERIFIED_CLAIM" ? "Registered claim (ownership not verified)" : "First author on record"}</p>
            <p className="result-author"><Addr value={data.first.first_author} /></p>
            <p>
              {firstWork ? <Link href={firstWork.original_url || firstWork.url}>{firstWork.title}</Link> : null}
              {firstWork ? <span className="mute"> registered {formatDate(firstWork.registered_at)}</span> : null}
            </p>
            <div className="pills">
              <Pill status={data.first.status} />
              <Pill status={data.first.authorship_tier || data.first.ownership} />
              {data.first.author_blacklisted ? <Pill tone="rust">Author blacklisted</Pill> : null}
            </div>
            {data.first.authorship_tier === "UNVERIFIED_CLAIM" ? (
              <Notice tone="amber">This address registered the link first on-chain, but has not proven it controls the page. Treat it as a claim, not established authorship.</Notice>
            ) : null}
            <p className="small mute break">Stored as {data.canonical}</p>
          </div>
          <div className="share">
            <p className="small mute">Share this result</p>
            <CopyText text={shareLink}>{shareLink}</CopyText>
          </div>

          {data.first.overturned ? (
            <div className="chain">
              <h2 className="h2">How priority moved</h2>
              <ol className="chain-list">
                {data.chain.map((w) => (
                  <li key={w.work_id}>
                    <span className="chain-dot" />
                    <div>
                      <p><Link href={w.original_url || w.url}>{w.title}</Link> <span className="mute small">#{w.work_id}</span> <Pill status={w.status} /></p>
                      <p className="small mute"><Addr value={w.author} />, registered {formatDate(w.registered_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {data.first.overturned && firstWork ? (
            <div>
              <h2 className="h2">The work that now holds priority</h2>
              <WorkRow work={firstWork} compact />
            </div>
          ) : null}

          {data.work ? (
            <div>
              <h2 className="h2">The registration for this link</h2>
              <WorkRow work={data.work} />
            </div>
          ) : null}

          {data.disputes?.length ? (
            <div>
              <h2 className="h2">Disputes</h2>
              {data.disputes.map((d) => (
                <DisputeRow key={d.dispute_id} dispute={d} work={data.work} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <NumberFinder initial={initialFind} key={initialFind ? `${initialFind.kind}-${initialFind.id}` : "none"} />
    </section>
  );
}
