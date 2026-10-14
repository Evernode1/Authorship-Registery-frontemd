import { useCallback, useEffect, useMemo, useState } from "react";
import { AppProvider, NavContext, useApp } from "./hooks.jsx";
import { Button, Link, TxBar } from "./components/ui.jsx";
import { CONTRACT_ADDRESS, CONTRACT_EXPLORER_LINK } from "./config.js";
import { shortAddr } from "./format.js";
import Lookup from "./views/Lookup.jsx";
import Register from "./views/Register.jsx";
import Works from "./views/Works.jsx";
import Disputes from "./views/Disputes.jsx";
import Profile from "./views/Profile.jsx";
import Account from "./views/Account.jsx";
import Contract from "./views/Contract.jsx";

const VIEWS = [
  ["lookup", "Look up a link"],
  ["register", "Register"],
  ["works", "Works"],
  ["disputes", "Disputes"],
  ["profile", "Addresses"],
  ["account", "Account"],
  ["contract", "Contract"],
];

function currentView() {
  const h = window.location.hash.replace("#", "");
  return VIEWS.some(([k]) => k === h) ? h : "lookup";
}

function Shell() {
  const { account, connect, isAdmin } = useApp();
  const [view, setView] = useState(currentView);
  // Arguments handed to the next view; navKey remounts a view that is already open.
  const [args, setArgs] = useState(() => ({ url: new URLSearchParams(window.location.search).get("url") || "" }));
  const [navKey, setNavKey] = useState(0);

  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((next, nextArgs = {}) => {
    setArgs(nextArgs);
    setNavKey((k) => k + 1);
    window.location.hash = next;
    setView(next);
    window.scrollTo({ top: 0 });
  }, []);

  const nav = useMemo(
    () => ({
      go,
      openLookup: (url) => go("lookup", { url: url || "" }),
      openFind: (kind, id) => go("lookup", { find: { kind, id } }),
      openProfile: (address) => go("profile", { address }),
      openDisputes: (filter) => go("disputes", { filter }),
      openWorks: (scope) => go("works", { scope }),
      startRegister: (url) => go("register", { url: url || "" }),
    }),
    [go]
  );

  return (
    <NavContext.Provider value={nav}>
      <div className="shell">
        <aside className="rail">
          <a className="brand" href="#lookup" onClick={() => go("lookup")}>
            <span className="brand-mark" aria-hidden="true" />
            <span>Authorship Registry</span>
          </a>
          <nav aria-label="Sections" className="nav">
            {VIEWS.map(([key, label]) => (
              <a key={key} href={`#${key}`} className={view === key ? "nav-link on" : "nav-link"} aria-current={view === key ? "page" : undefined} onClick={() => go(key)}>
                {label}
              </a>
            ))}
          </nav>
          <div className="rail-foot">
            {account ? (
              <p className="small"><span className="dot" aria-hidden="true" />Connected as <span className="mono">{shortAddr(account)}</span>{isAdmin ? " (admin)" : ""}</p>
            ) : (
              <Button variant="secondary" onClick={connect}>Connect wallet</Button>
            )}
            <p className="small mute">GenLayer Studio network. Contract <Link href={CONTRACT_EXPLORER_LINK}><span className="mono">{shortAddr(CONTRACT_ADDRESS)}</span></Link></p>
          </div>
        </aside>

        <main className="main" id="main" key={`${view}-${navKey}`}>
          {view === "lookup" ? <Lookup initialUrl={args.url || ""} initialFind={args.find} onRegister={nav.startRegister} /> : null}
          {view === "register" ? <Register initialUrl={args.url || ""} /> : null}
          {view === "works" ? <Works initialScope={args.scope || "all"} onRegister={nav.startRegister} /> : null}
          {view === "disputes" ? <Disputes initialFilter={args.filter || "open"} /> : null}
          {view === "profile" ? <Profile initialAddress={args.address || ""} /> : null}
          {view === "account" ? <Account /> : null}
          {view === "contract" ? <Contract /> : null}
        </main>
        <TxBar />
      </div>
    </NavContext.Provider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
