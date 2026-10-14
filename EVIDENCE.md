# Evidence for the steward

This file lists only what has been observed on StudioNet or executed locally. Each transaction below was checked in the StudioNet explorer. Anything not observed is marked **pending**.

## 0. Summary

| Area | Status |
| --- | --- |
| Registry contract deployed | Yes (see section 2) |
| Work registration on-chain | Yes (FINALIZED, SUCCESS) |
| Dispute opened and author responded on-chain | Yes (FINALIZED, SUCCESS) |
| Dispute resolved on-chain | Yes, but the ruling is **OPEN (CHALLENGER_PROOF_MISSING)**, not upheld |
| Author ownership verified (`PROOF_FOUND`) | **No.** Every attempt returned `UNVERIFIED` |
| Upheld dispute | **No** |
| Stake distribution, bond recovery, GEN withdrawal after resolution | **Not demonstrated** |
| Frontend receipt tests | 12 of 12 pass (run locally) |
| Pure contract tests (`tests/pure`) | Written, **not executed** |
| Direct Mode tests (`tests/direct`) | Written, **not executed** |

## 1. Tests

| Suite | Command | Result |
| --- | --- | --- |
| Frontend receipt check | `node --test tests/frontend/receipt.test.mjs` | **12 pass, 0 fail** (run in the build environment) |
| Pure contract logic | `python -m pytest tests/pure -q` | Not executed |
| Direct Mode (real GenVM) | `pytest tests/direct` | Not executed |

## 2. Contract addresses used

| Address | Role | Notes |
| --- | --- | --- |
| `0x5Ec95958E3C0798FF6491050c28E4B8dF988Bd4A` | Registry used for the register, challenger and dispute transactions in section 3 | Current address set in `.env.example` |
| `0xD3CA4d8E6F55129Db0c45bbEF35b489f3C9fb9b4` | Deploy-only control copy of the registry (no dispute run) | Deployed from the current source with the same tool that deploys the registry |
| `0xf3Dc63DAE5eB538c90D62De8035004 63D4e92A93` | Registry used in the 5:52 run (section 3, group D) | Contract address as printed by the run; confirm in explorer before citing |
| `0xceb1034b69E38360e246462374120aaA8a72015C` | Earlier deployment, has an older ABI and a storage bug (section 4) | Do not use for evidence of the current code |
| `0xcb743A2A24742d4CeD3EDeB6664eCc5972C4e569` | Earlier deployment, has the storage bug (section 4) | Do not use for evidence of the current code |

## 3. Transactions observed on StudioNet

Explorer base: `https://explorer-studio.genlayer.com/transactions/<hash>`

### A. Registry runs

| Step | Hash | Observed status | Notes |
| --- | --- | --- | --- |
| register_work (author work `test03`) | `0x87986c3e6ccafdf5a096e662111c6c45085dfc46885ca61c28dbc737833891b1` | FINALIZED, GenVM SUCCESS, value 0.001 GEN, to `0x5Ec95958…` | From `0x334D5092…` |
| register_work (challenger page `test05`) | `0x1d384ceb0fdecc8325ed8ba1ace2e555bdf4f1b9a556b549fb3bb09749e5db33` | FINALIZED, leader SUCCESS, to `0x5Ec95958…` | Sender `0xbFB8Ea070c…`. One validator was cancelled after quorum. The script wrongly reported this as a failure. The receipt check was fixed, and the leader result is what counts. |
| verify_work_ownership (`test06`) | `0xddb068d74872a231a83b7aeba5888f31a1bc6502661226cc3aefdba20a38b34c` | FINALIZED, result `UNVERIFIED` | Tag was live in the page's body, not in the head as seen by validators (see section 5) |
| verify_work_ownership (`test08`) | `0xb4752dec6245e62c440bf6120410d5894937ae6963348bb509903353233177c` | FINALIZED, result `UNVERIFIED` | Same cause |
| open_dispute (challenger `test07`, work 1) | `0x42813e77e2f0f2f6c8f47f75ea3bca6bb54987f5edafaeae5ba9eba5957c692c` | FINALIZED | |
| author responds | `0xd7d067549cee6c9e2badf9dbeeb2af7b225c496060445ea3c7ae55f6ce15e11e` | FINALIZED | |
| resolve_dispute | `0xecc9dc53bf8935d9d51c229dfd62bd0ef1758c3be878ef68f054918a7ce32273` | FINALIZED, returns null | Equivalence outputs: `challenger_page_status: ADDRESS_NOT_FOUND`, `similarity: IDENTICAL`, `work_page_status: FETCHED`. Challenger proof was not found by validators. |

### B. Upheld-scenario run (5:31)

| Step | Hash | Observed status | Notes |
| --- | --- | --- | --- |
| fund_rewards | `0x834cf81edabf004a9ca1fe9397fe2318bcb85d78f1f3c8d602c91d5b6c7316ae` | FINALIZED | |
| register_work (`test09`) | `0xd4f273af12136f3705eafa1aca53b00709bf6cfda9b4d0b17153a74bcda65ade` | FINALIZED | |
| verify_work_ownership (`test09`) | `0xbd60bb33a6b0c5f1e1ebb33014485850562b1274d105d8f61326813aab0fbdd5` | FINALIZED, `UNVERIFIED` | |
| register_work (challenger `test10`) | `0x38f7a0643dae45fa45fdde8889c8e9b298747210f74f61282a04db1dfed99520` | FINALIZED | |
| open_dispute | `0x296630d53052344b577b25593aeed25d13089203406be8cce3dba0db32268036` | FINALIZED | |
| author responds | `0x668c34b423073643f2ac48a21da0bd64f1ad7db0946d508696f05fe567103525` | FINALIZED | |
| resolve_dispute | `0x41569b2b533639c7c81873f7e1c3b632d3eebf224c7e3caee6807f8d4d29f4fd` | FINALIZED | **Ruling: OPEN (CHALLENGER_PROOF_MISSING).** Books balanced: true. Locked bonds 0.7 GEN, open stakes 0.1 GEN, reward pool 0.2 GEN, total deposited 0.37 GEN, withdrawn 0. Run file: `evidence/studionet-run-upheld-1791894711753.json` |

### C. Other registry runs

| Step | Hash | Observed status | Notes |
| --- | --- | --- | --- |
| fund_rewards | `0x86aca2c03e0b76826cb7ae0cf7286ad3f695b447b2b8249798db767779e4eeca` | FINALIZED | Run at 5:52 (group D contract) |
| register_work (`test11`) | `0xda53251a22ce294cef6763d17cafc11ec7311e7f27bdfaafa15c0598277b31a` | FINALIZED | Run at 5:52 |
| verify_work_ownership (`test11`) | `0x336bb8659d80f586ebe927b0996b2beecef0e9f5582dccc521e25167db68a571` | FINALIZED, `UNVERIFIED` | Validators returned `proof_status: PROOF_NOT_FOUND` |

## 4. Failed attempts (kept for the record)

| Hash | What failed | Cause | Fix |
| --- | --- | --- | --- |
| `0x9d0e95e9845db3f66445009b0c151ab086c1827da90c251208983d51e50462e8` | `open_dispute` on `0xcb743A2A…` | `TypeError: unhashable type: 'list'` while building a `DynArray` inside a `TreeMap` (GenVM storage) | Lists stored as comma-separated strings. Contract redeployed. |
| `0xd9ac5ca4e3cdca0efb376a0db23dbca1223335a5e150d5a0f3e2f9168d6826a6` | verify_work_ownership on the earlier contract | Result `UNVERIFIED` | Same renderer issue as section 5 |
| Several runs with `Contract rejected this call` | Reported by the script | The script treated a FINALIZED transaction with a cancelled-validator entry as failed | `src/receipt.js` now ignores validators cancelled after quorum. 12 unit tests cover this. |
| Several runs with `You have already registered this URL` | Reused URLs on the same contract | Expected contract behaviour | Use a new URL per run |

## 5. Why ownership verification fails (root cause)

The ownership proof is an `oar-proof` meta tag inside the page's `<head>`. Validators read pages through GenVM's web renderer, and a live diagnostic showed that the renderer returns only the `<body>`. For a page with a `<head>` containing the tag, the validators' output was:

```
level=NONE | html_len=152 | html_preview='\n <h1>Authorship test article</h1>\n <p>This is a test page…</p>\n\n\n'
```

The `<head>`, `<title>` and the `oar-proof` tag are all absent from what validators see. Curl and the browser show the tag, so the failure is in the renderer, not in the page, the cache, or timing. Changing the page, waiting longer, or using `index.html` URLs does not fix it.

Consequence: the head-tag proof cannot be verified on this renderer. The proposed replacement is a wallet-signature proof (EIP-191 `personal_sign`, recovered on-chain). See section 6.

## 6. Wallet-signature proof: status

| Item | Status |
| --- | --- |
| Pure-Python keccak256 | Verified off-chain against known vectors (`""` → `c5d2…a470`, `"abc"` → `4e03…6c45`) |
| EIP-191 message hash | Implemented; not yet checked on-chain |
| secp256k1 public-key recovery | Verified off-chain: privkey `1` recovers to `0x7e5f…5bdf`; three nonces round-trip; tampered message does not recover to the signer |
| GenVM availability of `eth_account`, `coincurve`, `ecdsa`, `Crypto.Hash.keccak` | **Not available.** Each raised `ModuleNotFoundError` on StudioNet, so the code must be self-contained |
| Recovery running inside a StudioNet contract | **Not yet confirmed.** A probe contract embedding the code was prepared; its deploy and call have not yet returned a result |
| Registry integration (signature in register/verify, frontend signing) | **Not started** |

## 7. Wallets

Several private keys were displayed in screenshots during testing. Treat every wallet whose key was displayed as compromised. Their transactions above are real and on-chain, but they should not be used for any further evidence or for holding funds. Final evidence should be produced with fresh wallets.

## 8. What is not demonstrated

- Ownership verified (`PROOF_FOUND`) by validators.
- Upheld outcome.
- Stake distribution after a completed resolution.
- Bond recovery for the challenger and author.
- GEN withdrawal by each wallet after resolution.
- A complete end-to-end run with separate author, challenger and keeper wallets that ends in a valid outcome.
- Execution of the pure contract test suite and the Direct Mode suite.

## 9. Reproducing the observed runs

```bash
npm install
set -a; . ~/.genlayer-keys.env; set +a   # fresh keys only
node scripts/e2e-studionet.mjs
```

`SCENARIO=upheld` and `SCENARIO=rejected` select the two dispute paths. The script writes `evidence/studionet-run-<scenario>-<timestamp>.json`. Copy the hashes from that file into section 3. Do not fill section 3 from memory.
