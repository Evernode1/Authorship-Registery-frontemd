#!/usr/bin/env node
// Runs the full lifecycle on GenLayer StudioNet with three real wallets and writes the
// transaction hashes to evidence/studionet-run-<timestamp>.json (and prints explorer links).
//
// STATUS: not executed by its author (no network where it was written). It uses the same
// genlayer-js calls as src/chain.js. Run it yourself, then paste the printed table into EVIDENCE.md.
//
// Two scenarios, because they need different archive history (see EVIDENCE.md, "Preparing pages"):
//   SCENARIO=upheld    the challenger's page was archived BEFORE the author's work was registered
//   SCENARIO=rejected  the author's page was archived BEFORE the challenger's earliest capture
//
// Required env:
//   AUTHOR_KEY, CHALLENGER_KEY, KEEPER_KEY     0x-prefixed private keys of three funded StudioNet accounts
//   AUTHOR_PAGE_URL                             a page you control, where you can edit the HTML <head>
//   CHALLENGER_PAGE_URL                         the earlier page (archived), tag will be asked for
// Optional: CONTRACT_ADDRESS (skip deploy), SCENARIO (default upheld)
import fs from "node:fs";
import readline from "node:readline/promises";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { assessReceipt } from "../src/receipt.js";

const need = (k) => {
  if (!process.env[k]) throw new Error(`Missing env ${k}`);
  return process.env[k];
};
const BOND = 10n ** 15n;
const STAKE = 5n * 10n ** 15n;
const EXPLORER = (process.env.VITE_EXPLORER_URL || "https://explorer-studio.genlayer.com").replace(/\/$/, "");
const scenario = process.env.SCENARIO || "upheld";

const accounts = {
  author: createAccount(need("AUTHOR_KEY")),
  challenger: createAccount(need("CHALLENGER_KEY")),
  keeper: createAccount(need("KEEPER_KEY")),
};
const clients = Object.fromEntries(Object.entries(accounts).map(([k, a]) => [k, createClient({ chain: studionet, account: a })]));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Wait until the live page actually contains the exact tag. Validators read the live page, so
// verifying before GitHub Pages has published the commit gives a false PROOF_NOT_FOUND.
async function waitForTagLive(url, tag, { everyMs = 15000, timeoutMs = 15 * 60 * 1000, settleMs = 120000 } = {}) {
  const found = (html) => {
    // Same idea as the contract: any oar-proof meta tag whose content equals the token.
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
      const t = m[0];
      if (!/name\s*=\s*["']oar-proof["']/i.test(t)) continue;
      const c = t.match(/content\s*=\s*["']([^"']*)["']/i);
      if (c && c[1] === tag) return true;
    }
    return false;
  };
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      // Validators do not follow redirects, so a URL that redirects would be judged as "tag not found".
      const res = await fetch(`${url}?cb=${Date.now()}`, { cache: "no-store", redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        throw new Error(`${url} answers ${res.status} (redirect). Use the exact URL that serves 200, such as https://kashif130.github.io/NAME/index.html`);
      }
      const html = await res.text();
      if (found(html)) {
        // CDN caches can keep serving the old page to validators for a few minutes after the
        // script sees the new one, so wait before anything reads the page on-chain.
        console.log(`✔ Tag is live at ${url} (attempt ${attempt}). Waiting ${settleMs / 1000}s for CDN caches to settle...`);
        await new Promise((r) => setTimeout(r, settleMs));
        return;
      }
      console.log(`… tag not live yet at ${url} (attempt ${attempt}), retrying in ${everyMs / 1000}s`);
    } catch (err) {
      if (String(err.message).includes("(redirect)")) throw err; // a configuration error, not a transient one
      console.log(`… could not fetch ${url} (${err.message}), retrying`);
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`Tag never appeared at ${url}. Check the commit, and that the content is exactly: ${tag}`);
}

const log = [];

async function waitFinalized(client, hash) {
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, retries: 240, interval: 5000 });
  const verdict = assessReceipt(receipt);
  if (!verdict.ok) {
    // Print the raw receipt so the exact field that caused the failure can be checked.
    console.error("RAW RECEIPT:", JSON.stringify(receipt, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    throw new Error(`tx ${hash} did not execute successfully: ${verdict.reason} [failing signal: ${verdict.code ?? "none"}]`);
  }
  return receipt;
}

async function call(who, step, functionName, args = [], value = 0n) {
  const client = clients[who];
  const hash = await client.writeContract({ address: contract, functionName, args, value });
  await waitFinalized(client, hash);
  log.push({ step, who, functionName, hash, explorer: `${EXPLORER}/transactions/${hash}` });
  console.log(`✔ ${step}\n   ${EXPLORER}/transactions/${hash}`);
  return hash;
}
const view = (functionName, args = []) => clients.keeper.readContract({ address: contract, functionName, args });

let contract = process.env.CONTRACT_ADDRESS;
if (!contract) {
  const code = fs.readFileSync(new URL("../src/contract/AuthorshipRegistry.py", import.meta.url), "utf8");
  const hash = await clients.author.deployContract({ code, args: [] });
  const receipt = await waitFinalized(clients.author, hash);
  contract = receipt?.data?.contract_address;
  if (!contract) throw new Error("Deploy accepted but no contract address in the receipt; set CONTRACT_ADDRESS and rerun.");
  log.push({ step: "Deploy", who: "author", functionName: "deploy", hash, explorer: `${EXPLORER}/transactions/${hash}` });
  console.log(`✔ Deployed ${contract}`);
}

const authorPage = need("AUTHOR_PAGE_URL");
const challengerPage = need("CHALLENGER_PAGE_URL");
const stats = await view("get_registry_stats");
const workId = Number(stats.total_works) + 1;

await call("keeper", "Fund reward pool", "fund_rewards", [], 10n ** 15n * 4n);
await call("author", "Register work", "register_work", [authorPage, "E2E work", "POST", ""], BOND);

const workTag = await view("get_work_proof", [workId]);
await rl.question(`\nPut this inside the <head> of ${authorPage}, COMMIT and wait for it to deploy, then press Enter…\n  <meta name="oar-proof" content="${workTag}">\n`);
await waitForTagLive(authorPage, workTag);
await call("keeper", "Verify ownership (head tag)", "verify_work_ownership", [workId]);
const w = await view("get_work", [workId]);
console.log("   ownership:", w.ownership, "tier:", w.authorship_tier);

// The challenger registers their own earlier page first; the dispute is bound to that registration.
await call("challenger", "Register challenger page", "register_work", [challengerPage, "Challenger earlier page", "POST", ""], BOND);
const challengerWorkId = Number(stats.total_works) + 2;
const chalTag = await view("get_work_proof", [challengerWorkId]);
await rl.question(`\nPut this inside the <head> of ${challengerPage}, COMMIT and wait for it to deploy, then press Enter…\n  <meta name="oar-proof" content="${chalTag}">\n`);
await waitForTagLive(challengerPage, chalTag);
await call("challenger", "Open dispute", "open_dispute", [workId, challengerWorkId, challengerPage, "My earlier archived page was copied."], STAKE);
const disputeId = Number(stats.total_disputes) + 1;
await call("author", "Author responds", "respond_to_dispute", [disputeId, "", "I wrote this myself; see my statement."]);
await call("keeper", "Resolve dispute", "resolve_dispute", [disputeId]);

const d = await view("get_dispute", [disputeId]);
console.log(`   ruling: ${d.status} (${d.outcome_code}); dates: challenger=${d.challenger_published_at} [${d.challenger_date_basis}], registered=${d.respondent_published_at} [${d.respondent_date_basis}]`);

const before = {};
for (const who of ["author", "challenger", "keeper"]) before[who] = BigInt(await view("get_balance", [accounts[who].address]));
console.log("   pending balances (wei):", Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v.toString()])));
for (const who of ["author", "challenger", "keeper"]) {
  if (before[who] > 0n) await call(who, `Withdraw GEN (${who})`, "withdraw");
}
const acct = await view("get_accounting");
console.log("   books balanced:", acct.balanced, acct);

fs.mkdirSync(new URL("../evidence/", import.meta.url), { recursive: true });
const out = new URL(`../evidence/studionet-run-${scenario}-${Date.now()}.json`, import.meta.url);
fs.writeFileSync(out, JSON.stringify({ contract, scenario, workId, disputeId, ruling: { status: d.status, outcome_code: d.outcome_code }, pendingBeforeWithdraw: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v.toString()])), accounting: acct, transactions: log }, null, 2));
console.log(`\nWrote ${out.pathname}`);
rl.close();
