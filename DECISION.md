# Design decisions (steward round)

This file answers the steward's request and records what the contract does and does not prove.

## What changed, and why

| Steward point | Before | Now |
| --- | --- | --- |
| Ownership relied on a reproducible token "anywhere in a webpage" | The model was asked whether `oar-proof:<address>` appeared anywhere in the page text. The token was public, the same for every work, and satisfied by a comment or reply. | Ownership is checked by plain code, with no model involved. The token must sit in `<meta name="oar-proof" content="...">` inside the HTML head, and it is bound to the author **and the work number** (`oar-proof:<address>:w<id>`, `get_work_proof`). A match anywhere else is reported as `PROOF_BODY_ONLY` and does **not** verify. Validators must agree exactly (`strict_eq`) on the code's result. |
| Publication dates that interested parties can manipulate | The model read dates off the pages themselves and the contract used the earliest. A page could simply claim 2001. | Dates that decide money come only from (1) the earliest Internet Archive capture of the link, read from the Wayback snapshot, or (2) a date published by a listed platform (registered side and defense evidence only). A page's self-declared date is stored for display and **never** used. The model no longer reports any date or proof status. The registered side with no trusted date is ranked at its on-chain registration time. |
| Unverified registrations vs. established authorship | One "ownership unverified" pill. | Every work and first-author lookup carries `authorship_tier`: `UNVERIFIED_CLAIM`, `OWNERSHIP_VERIFIED`, `ESTABLISHED` (verified, and survived a dispute or won one). Surviving a dispute does not lift an unverified claim. The UI says so in words. |
| Frontend GenVM execution-success checks | A regex over the leader receipt for `error\|revert`. An agreed ERROR passed as success when the receipt shape differed. | `src/receipt.js` fails closed: success needs an affirmative signal and no failure signal in any leader receipt or the tx result. No recognizable signal means "unconfirmed", not "done". After verify and resolve the UI reads the result back and says what happened (for example "Not verified. Token seen only in the page body"). |
| Adversarial Direct Mode tests and end-to-end StudioNet evidence | None in the repo. | `tests/pure` (66 tests written, not executed in this round), `tests/direct` (written, not executed), `tests/frontend` (10 tests, executed and passing), `scripts/e2e-studionet.mjs` and `EVIDENCE.md` (run not yet done, no transaction hashes yet). |
| Default contract address | The previous deployment was the default, so the site would call it with the new ABI. | No default. `VITE_CONTRACT_ADDRESS` is required. Without a valid address, every contract call fails with a clear message before reaching the network. |

## What the contract still does not prove

- **Archive capture proves the URL existed by that time, not who wrote it.** The challenger also needs the proof tag in the live page's head, and the comparison runs on the archived text, so a page swapped after an old capture cannot borrow the old date.
- **The head-tag rule excludes sites where users cannot edit the HTML head** (most social platforms). Those authors can register a link and keep an unverified claim; they cannot reach `OWNERSHIP_VERIFIED`. A challenger on such a site cannot pass the proof either. This is a deliberate trade: the alternative, trusting visible text, is exactly the forgery the steward flagged.
- **The Wayback capture time is read from the rendered snapshot** (`wbinfo.timestamp` or the "FILE ARCHIVED ON" comment). The latest stamp found wins, so text inside an archived page cannot make a capture look older. If the validators' render does not expose a stamp, the date is unknown and the dispute stays inconclusive; the contract never guesses. This must be confirmed on StudioNet with a real snapshot (see EVIDENCE.md, step 0).
- **PLATFORM dates** are only as good as the platform's own metadata, and only count when the host is in `PLATFORM_DATE_HOSTS` (`get_config` lists them).
- **Similarity is still a model judgment**, on archived text. The model cannot change dates, proof status or the verdict; contract code does.
- **Fetch targets are caller-supplied.** URL shape checks stay as before; the validators' network sandbox is the backstop.

## Tradeoffs worth knowing

- A genuine author with a self-hosted, never-archived page loses to an archived challenger unless they answer the dispute with archive evidence (a `web.archive.org` snapshot of their page). Burden of proof is on whoever relies on a date, and this is the cheapest way to meet it.
- Each dispute round now makes more web fetches (live page, two archive snapshots, the registered page, optional evidence). Rounds are slower than before.
- The contract ABI changed (`get_work_proof`, new dispute fields, `authorship_tier`). It needs a **redeploy**; set `VITE_CONTRACT_ADDRESS` to the new address.

## Status of this round

- Done in code: ownership check, date trust, authorship tiers, receipt check, UI wording, contract address handling.
- Not done, and not claimed as done: running `tests/pure` and `tests/direct`, running the StudioNet lifecycle, and recording transaction hashes. These need a machine with network access and funded StudioNet keys. `EVIDENCE.md` lists what to run and what to record.
- Not verified against the live site: the earlier screenshot shows a "Steward request" card with Edit and Resubmit buttons, which does not exist in this source. Confirm that the deployed build comes from this source before treating the live site as the reference.

## Ownership binding for disputes (this round)

- `open_dispute(work_id, challenger_work_id, challenger_url, statement)`: the challenger must hold an ACTIVE registration of the challenger URL. The contract refuses otherwise.
- Resolution checks the challenger's page for the work-specific tag `oar-proof:<challenger>:w<challenger_work_id>`, the same rule `verify_work_ownership` uses. The address-only tag is no longer accepted in disputes.
- The dispute record stores `challenger_work_id` and exposes it in `get_dispute`.
- The contract ABI changed. The previously deployed contract cannot be used with this build. Redeploy and set `VITE_CONTRACT_ADDRESS`.

## Still open

- `chain.js` waits for `ACCEPTED`, not `FINALIZED`. The SDK enum name has not been confirmed in this environment.
- Pure, Direct Mode and e2e tests have been updated to the new signature but have not been executed.
- No StudioNet run has been recorded for the new deployment.

## Storage fix found on StudioNet (this round)

- Run `0x9d0e95e9845db3f66445009b0c151ab086c1827da90c251208983d51e50462e8` (open_dispute) failed inside GenVM with `TypeError: unhashable type: 'list'` while building the storage type for `DynArray[str]` inside `TreeMap`. The failure is in the contract, not the frontend or the script.
- Fix: `author_works`, `work_disputes` and `challenger_disputes` now hold comma-separated strings (`TreeMap[str, str]`). Readers use `_list_of`. The contract needs redeploying again, so its address changes.

