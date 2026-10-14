const WEI = 10n ** 18n;

export function formatGen(wei, maxDecimals = 6) {
  let v;
  try {
    v = BigInt(wei ?? 0);
  } catch {
    return "0";
  }
  const whole = v / WEI;
  const frac = (v % WEI).toString().padStart(18, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function parseGen(text) {
  const t = String(text).trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w) * WEI + BigInt(f.padEnd(18, "0"));
}

export function shortAddr(a) {
  if (!a) return "";
  const s = String(a);
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

export function sameAddr(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
}

// Contract dates are YYYY-MM-DD (day precision, read as 00:00 UTC) or YYYY-MM-DDTHH:MM:SSZ.
export function epochOf(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

export function isDayOnly(iso) {
  return typeof iso === "string" && iso.length === 10;
}

export function formatDate(iso) {
  if (!iso) return "No date";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  if (isDayOnly(iso)) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  }
  return (
    d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }) + " UTC"
  );
}

export function formatDuration(seconds) {
  let s = Math.abs(Math.round(seconds));
  if (s < 60) return `${s} sec`;
  const units = [["d", 86400], ["h", 3600], ["min", 60]];
  const parts = [];
  for (const [name, size] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      s -= n * size;
      parts.push(`${n} ${name}`);
    }
    if (parts.length === 2) break;
  }
  return parts.join(" ");
}

export function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

export const clean = (s) => String(s ?? "").trim();

export const proofToken = (address) => `oar-proof:${String(address || "").toLowerCase()}`;
/** The only form the contract accepts: the token inside a meta tag in the page's HTML head. */
export const metaTag = (token) => `<meta name="oar-proof" content="${token}">`;

export const SIMILARITY_TEXT = {
  IDENTICAL: "Same text",
  SUBSTANTIALLY_SIMILAR: "Largely the same",
  DIFFERENT: "Different content",
  UNDETERMINED: "Validators could not tell",
};
export const PROOF_TEXT = {
  ADDRESS_FOUND: "Proof tag found in the challenger's HTML head",
  ADDRESS_BODY_ONLY: "Token seen only in the challenger's page body, which does not count",
  ADDRESS_NOT_FOUND: "Proof tag missing from the challenger's page",
  NOT_CHECKED: "Challenger's page not checked",
  FETCH_UNAVAILABLE: "A page could not be fetched",
};
export const EVIDENCE_TEXT = {
  NOT_PROVIDED: "No defense evidence",
  SAME_CONTENT: "Evidence shows the same content as the registered page",
  DIFFERENT: "Evidence is different content",
  FETCH_UNAVAILABLE: "Evidence could not be fetched",
};

export const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || "").trim());

export const bpsShare = (wei, bps) => {
  try {
    return (BigInt(wei ?? 0) * BigInt(bps ?? 0)) / 10000n;
  } catch {
    return 0n;
  }
};

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatCountdown(targetEpoch, now = nowEpoch()) {
  if (targetEpoch === null || targetEpoch === undefined) return "";
  return targetEpoch > now ? `in ${formatDuration(targetEpoch - now)}` : `${formatDuration(now - targetEpoch)} ago`;
}

/** What the contract says about a dispute right now, so every screen enables the same buttons. */
export function disputeState(d, config, now = nowEpoch()) {
  const isOpen = d.status === "OPEN";
  const deadline = epochOf(d.response_deadline);
  const windowOpen = deadline !== null && now <= deadline;
  const last = epochOf(d.last_checked_at);
  const cooldown = Number(config.resolution_cooldown_seconds || 86400);
  const nextRound = d.attempts > 0 && last !== null ? last + cooldown : null;
  const cooling = nextRound !== null && now < nextRound;
  return {
    isOpen,
    deadline,
    windowOpen,
    nextRound,
    cooling,
    canRespond: isOpen && !d.responded && windowOpen,
    canResolve: isOpen && (d.responded || !windowOpen) && !cooling,
  };
}

// Same wording the contract stores for each outcome code (it never stores model text).
export const OUTCOME_TEXT = {
  CHALLENGER_FIRST: "Pages are the same content and the challenger's page was published first.",
  CHALLENGER_PUBLISHED_LATER: "Pages are the same content but the challenger's page is not earlier.",
  CONTENT_DIFFERENT: "Validators found the two pages are different content.",
  FETCH_UNAVAILABLE: "A required page could not be fetched; nothing was decided.",
  SIMILARITY_UNDETERMINED: "Validators could not determine how similar the pages are.",
  CHALLENGER_PROOF_MISSING: "The challenger's page does not carry the challenger's proof token in its HTML head.",
  CHALLENGER_DATE_UNKNOWN: "No trusted publication date (an archive capture) was found for the challenger's page.",
  TOO_CLOSE_TO_CALL: "Both pages were published within the minimum gap of each other.",
  CHALLENGER_URL_TAKEN: "The challenger's URL was registered by another address in the meantime.",
};

export const OUTCOME_VERDICT = {
  CHALLENGER_FIRST: "UPHELD",
  CHALLENGER_PUBLISHED_LATER: "REJECTED",
  CONTENT_DIFFERENT: "REJECTED",
  FETCH_UNAVAILABLE: "INCONCLUSIVE",
  SIMILARITY_UNDETERMINED: "INCONCLUSIVE",
  CHALLENGER_PROOF_MISSING: "INCONCLUSIVE",
  CHALLENGER_DATE_UNKNOWN: "INCONCLUSIVE",
  TOO_CLOSE_TO_CALL: "INCONCLUSIVE",
  CHALLENGER_URL_TAKEN: "INCONCLUSIVE",
};

export const OWNERSHIP_RESULT_TEXT = {
  PROOF_FOUND: "Proof tag found in the page's HTML head",
  PROOF_BODY_ONLY: "Token seen only in the page body, which anyone can write, so it does not count",
  PROOF_NOT_FOUND: "Proof tag not found on the last check",
  FETCH_UNAVAILABLE: "Page could not be fetched on the last check",
};

/** Where a date used in a ruling came from. Self-declared page dates are never used. */
export const DATE_BASIS_TEXT = {
  ARCHIVE: "Internet Archive capture",
  PLATFORM: "platform-published date",
};
