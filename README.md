# Authorship Registry frontend

React + Vite single-page app for the `AuthorshipRegistry` Intelligent Contract on GenLayer Studio.

The contract in `src/contract/AuthorshipRegistry.py` changed its ABI after steward review
(`get_work_proof`, `authorship_tier`, date-basis fields). The old deployment `0xf216944E7a6E3760D38Cbb7450D99b12b4a0955f`
is no longer used as a default. **Redeploy the contract and set `VITE_CONTRACT_ADDRESS`** to the new
address (currently `0xC6f55378E34E9c7273B1AC04eE9567F0553857b3`, also in `.env.example`). Until it is set, the site shows an error on every contract call instead of talking to the old
contract. See `DECISION.md` for what changed and why, and `EVIDENCE.md` for what has and has not been run.

The contract source is bundled in `src/contract/AuthorshipRegistry.py` and shown on the **Contract** page.

## Contract coverage

Every public method has a screen.

| Method | Where |
| --- | --- |
| `register_work`, `preview_canonical_url`, `get_work_by_url` | Register (live canonical preview, duplicate and overturned-link check, fingerprint helper) |
| `withdraw_registration`, `release_bond` | Works / Lookup (confirmation, lock countdown) |
| `verify_work_ownership`, `get_expected_proof` | Works / Lookup (anyone can run it, cooldown shown, keeper reward noted) |
| `open_dispute` | Challenge form (proof token, lost-before check, URL checks, window check, blacklist check) |
| `respond_to_dispute` | Respond form (evidence only, statement only, or both) |
| `withdraw_dispute` | Dispute card (fee shown before confirming) |
| `resolve_dispute` | Dispute card (cooldown, rounds, payout explanation) |
| `fund_rewards`, `withdraw` | Account |
| `blacklist_address`, `unblacklist_address`, `transfer_admin` | Account, admin wallet only |
| `get_blacklist_status` | Banner for a blacklisted wallet, Account lookup, Addresses page |
| `get_first_author`, `get_work`, `get_dispute` | Lookup (by link, or "Open by number") |
| `list_works`, `list_works_by_author` | Works (paged, status filter) |
| `list_disputes`, `list_disputes_by_challenger`, `list_disputes_for_work` | Disputes tabs: Needs action, Open, Settled, All, Ones I opened, Against my works |
| `get_author_stats`, `get_balance` | Account, Addresses page (any wallet) |
| `get_registry_stats`, `get_accounting`, `get_reward_pool`, `get_admin`, `get_config` | Account (registry) and Contract page |

Other things the app shows: publication-order bar with the one-hour gap, where the money went for each settled dispute, a "Waiting on you" list (respond or resolve), shareable lookup links (`/?url=...`), the full list of outcome codes, and the live rules and numbers from `get_config`.

Reading needs no wallet. Writing needs a browser wallet such as MetaMask.

## How ownership and dates work now

- Ownership is proven with `<meta name="oar-proof" content="TOKEN">` in the page's HTML head. The author's token is bound to the author and the work number (`get_work_proof`); a challenger uses `get_expected_proof`. The same text in a comment, reply or body does not count. This check is plain code, not a model judgment.
- Only Internet Archive capture times (and platform-published dates on listed hosts) can decide a dispute. A page's own claimed date is shown for information only.
- Works and lookups show `authorship_tier`: unverified claim, ownership verified, or established author.
- A transaction counts as done only if its receipt shows the contract call succeeded (`src/receipt.js`, fails closed). Verify and resolve read the result back and say what happened.

## Tests

```bash
python -m pytest tests/pure -q          # contract rules on a stubbed GenVM (needs pytest)
npm run test:frontend                   # receipt checks (node only, passes)
pip install genlayer-test && pytest tests/direct   # Direct Mode, real GenVM (NOT yet run, see file header)
node scripts/e2e-studionet.mjs          # full lifecycle on StudioNet, writes evidence/ (NOT yet run)

Status: only `npm run test:frontend` has been run by us. The pure suite and Direct Mode suite are written
but were not executed in the environment they were written in. See `EVIDENCE.md`.
```

## Run locally

```bash
npm install
npm run dev
```

## Deploy on Vercel

1. Push this folder to a Git repository (commit `package-lock.json` after your first `npm install`).
2. In Vercel choose **Add New, Project**, import the repo. Framework preset: **Vite** (detected from `vercel.json`).
3. Environment variables:
   - `VITE_CONTRACT_ADDRESS` (required, the redeployed contract)
   - `VITE_EXPLORER_URL` (optional, defaults to the StudioNet explorer)
4. Deploy. Or from the CLI: `npx vercel --prod`.

If you redeploy the contract, change `VITE_CONTRACT_ADDRESS` in Vercel, replace `src/contract/AuthorshipRegistry.py` with the new source, and redeploy the site.

## Notes

- Sections use `#hash` links, so no server rewrites are needed. `vercel.json` still sends unknown paths to `index.html`.
- Consensus rounds (verify ownership, resolve dispute) read web pages and can take minutes; the progress bar stays up until validators accept.
