import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import * as GLTypes from "genlayer-js/types";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED } from "./config.js";
import { assessReceipt } from "./receipt.js";

const { TransactionStatus, CalldataAddress } = GLTypes;

// Fails before any network call when no valid contract address is configured.
function requireContract() {
  if (!CONTRACT_CONFIGURED) {
    throw new Error(
      "No contract address is configured for this site. Set VITE_CONTRACT_ADDRESS to the redeployed AuthorshipRegistry address and rebuild."
    );
  }
  return CONTRACT_ADDRESS;
}

// Read-only client: no wallet needed.
const readClient = createClient({ chain: studionet });

const writeClients = new Map();
function writeClient(account) {
  const key = String(account).toLowerCase();
  if (!writeClients.has(key)) {
    writeClients.set(key, createClient({ chain: studionet, account }));
  }
  return writeClients.get(key);
}

/** Turn Maps, bigints and byte arrays from the GenLayer decoder into plain JSON-like values. */
export function normalize(v) {
  if (v instanceof Map) {
    const o = {};
    for (const [k, val] of v) o[String(k)] = normalize(val);
    return o;
  }
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === "bigint") {
    return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  }
  if (v instanceof Uint8Array) {
    return "0x" + Array.from(v, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = normalize(val);
    return o;
  }
  return v;
}

/** Address-typed contract arguments. Falls back to the plain string if the SDK has no wrapper. */
export function addr(a) {
  if (CalldataAddress && typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a)) {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) bytes[i] = parseInt(a.slice(2 + i * 2, 4 + i * 2), 16);
    return new CalldataAddress(bytes);
  }
  return a;
}

export async function read(functionName, args = []) {
  const res = await readClient.readContract({ address: requireContract(), functionName, args });
  return normalize(res);
}

/** Plain-language message for a failed call. The contract prefixes user errors with [EXPECTED]. */
export function errorMessage(err) {
  const raw = String(err?.shortMessage || err?.message || err || "Something went wrong");
  const expected = raw.match(/\[EXPECTED\]\s*([^\n"\\]+)/);
  if (expected) return expected[1].trim();
  if (/\[LLM_ERROR\]/.test(raw)) return "The validators' model returned an unreadable answer. Try again.";
  if (/user rejected|denied|rejected the request/i.test(raw)) return "You cancelled the request in your wallet.";
  return raw.length > 240 ? raw.slice(0, 240) + "…" : raw;
}

export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

export async function connectWallet() {
  if (!hasWallet()) throw new Error("No browser wallet found. Install MetaMask to send transactions.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0];
  if (!account) throw new Error("Your wallet did not share an account.");
  try {
    await writeClient(account).connect("studionet");
  } catch {
    // Network may already be configured; sending will fail loudly if it is not.
  }
  return account;
}

/**
 * Sends a write call and waits until validators have accepted it.
 * onPhase("wallet" | "consensus", hash?) lets the UI show progress.
 */
export async function write({ account, functionName, args = [], value = 0n, onPhase = () => {} }) {
  const client = writeClient(account);
  onPhase("wallet");
  const hash = await client.writeContract({ address: requireContract(), functionName, args, value });
  onPhase("consensus", hash);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    retries: 180,
    interval: 5000,
  });
  // Wait for FINALIZED (confirmed on StudioNet). Validators can agree on an ERROR, so the receipt is still checked. Fail closed.
  const verdict = assessReceipt(receipt);
  if (!verdict.ok) {
    // No fallback: a receipt without a positive success signal is never shown as done.
    if (verdict.unconfirmed) console.error("Unrecognized receipt shape", receipt);
    throw new Error(verdict.reason);
  }
  return { hash, receipt };
}

/**
 * Reads the newest `count` records of a paged list view (offset, limit; the contract caps a page at 50).
 * `extra` holds leading arguments such as an author address. Returns newest first.
 */
export async function readNewest(functionName, total, count, extra = []) {
  const n = Math.min(Number(total) || 0, count);
  const out = [];
  for (let start = total - n; start < total; start += 50) {
    const size = Math.min(50, total - start);
    out.push(...(await read(functionName, [...extra, start, size])));
  }
  return out.reverse();
}
