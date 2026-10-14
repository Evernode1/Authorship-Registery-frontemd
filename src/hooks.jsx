import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG } from "./config.js";
import { addr, connectWallet, errorMessage, read, write } from "./chain.js";
import { clean, sameAddr } from "./format.js";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

/** Navigation helpers provided by the shell (open a link, an address, a disputes tab...). */
export const NavContext = createContext(null);
export const useNav = () => useContext(NavContext);

const NOT_BLACKLISTED = { blacklisted: false, reason: "" };

export function AppProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [admin, setAdmin] = useState("");
  const [status, setStatus] = useState(NOT_BLACKLISTED);
  const [version, setVersion] = useState(0);
  const [tx, setTx] = useState(null);
  const busy = useRef(false);

  useEffect(() => {
    read("get_config").then((c) => c && c.registration_bond_wei && setConfig({ ...DEFAULT_CONFIG, ...c })).catch(() => {});
  }, []);

  useEffect(() => {
    read("get_admin").then((a) => setAdmin(String(a || ""))).catch(() => {});
  }, [version]);

  useEffect(() => {
    if (!account) {
      setStatus(NOT_BLACKLISTED);
      return;
    }
    let live = true;
    read("get_blacklist_status", [addr(account)])
      .then((s) => live && setStatus({ blacklisted: !!s?.blacklisted, reason: s?.reason || "" }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [account, version]);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return undefined;
    const onChange = (accs) => setAccount(accs?.[0] ?? null);
    eth.on("accountsChanged", onChange);
    eth.request?.({ method: "eth_accounts" }).then((a) => a?.[0] && setAccount(a[0])).catch(() => {});
    return () => eth.removeListener?.("accountsChanged", onChange);
  }, []);

  const connect = useCallback(async () => {
    try {
      setAccount(await connectWallet());
    } catch (e) {
      setTx({ label: "Connect wallet", phase: "error", error: errorMessage(e) });
    }
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  /** Runs a contract write and reports progress. Resolves true on success. */
  const send = useCallback(
    async (label, functionName, args = [], value = 0n, opts = {}) => {
      if (busy.current) return false;
      let who = account;
      if (!who) {
        try {
          who = await connectWallet();
          setAccount(who);
        } catch (e) {
          setTx({ label, phase: "error", error: errorMessage(e) });
          return false;
        }
      }
      busy.current = true;
      setTx({ label, phase: "wallet" });
      try {
        const { hash } = await write({
          account: who,
          functionName,
          args,
          value,
          confirm: opts.confirm,
          onPhase: (phase, h) => setTx({ label, phase, hash: h }),
        });
        // Accepted is not the same as "it did what you hoped": read the result back when asked.
        let note = null;
        if (typeof opts.after === "function") {
          try {
            note = await opts.after();
          } catch {
            note = null;
          }
        }
        setTx({ label, phase: "done", hash, note });
        refresh();
        return true;
      } catch (e) {
        setTx({ label, phase: "error", error: errorMessage(e) });
        return false;
      } finally {
        busy.current = false;
      }
    },
    [account, refresh]
  );

  const value = {
    account,
    config,
    admin,
    isAdmin: sameAddr(admin, account),
    status,
    version,
    tx,
    setTx,
    connect,
    send,
    refresh,
    busy: tx && (tx.phase === "wallet" || tx.phase === "consensus"),
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Loads a value on mount and whenever deps or the global version change. */
export function useRead(loader, deps = []) {
  const { version } = useApp();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve()
      .then(loader)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error) => live && setState({ data: null, error: errorMessage(error), loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return state;
}

/**
 * Debounced check of a link against the contract: its canonical form, the registration that already
 * holds it (if any), or the reason the contract would refuse it.
 */
export function useUrlPreview(url) {
  const { version } = useApp();
  const [state, setState] = useState({ canonical: "", existing: null, error: "", checking: false });
  useEffect(() => {
    const u = clean(url);
    if (u.length < 10) {
      setState({ canonical: "", existing: null, error: "", checking: false });
      return undefined;
    }
    let live = true;
    setState((s) => ({ ...s, checking: true }));
    const t = setTimeout(async () => {
      try {
        const canonical = await read("preview_canonical_url", [u]);
        const existing = await read("get_work_by_url", [u]);
        if (live) setState({ canonical, existing: existing?.work_id ? existing : null, error: "", checking: false });
      } catch {
        if (live) setState({ canonical: "", existing: null, error: "This link is not accepted. Use a public https address with a real domain name.", checking: false });
      }
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [url, version]);
  return state;
}
