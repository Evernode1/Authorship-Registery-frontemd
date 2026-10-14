// No default address on purpose. The previously deployed contract has an older ABI (no
// get_work_proof, authorship_tier, date-basis fields), so calling it from this build would fail
// or show wrong results. Set VITE_CONTRACT_ADDRESS to the contract you redeployed from
// src/contract/AuthorshipRegistry.py.
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || "").trim();
export const CONTRACT_CONFIGURED = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);

export const EXPLORER_URL = (
  import.meta.env.VITE_EXPLORER_URL || "https://explorer-studio.genlayer.com"
).replace(/\/$/, "");

export const CONTRACT_EXPLORER_LINK = CONTRACT_CONFIGURED
  ? `${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`
  : EXPLORER_URL;

// Used only until get_config() answers. Mirrors the constants in the contract.
export const DEFAULT_CONFIG = {
  registration_bond_wei: "1000000000000000",
  challenge_stake_wei: "5000000000000000",
  keeper_reward_wei: "500000000000000",
  resolver_reward_wei: "500000000000000",
  author_share_bps: 6000,
  challenger_bounty_bps: 5000,
  withdraw_fee_bps: 1000,
  inconclusive_fee_bps: 1000,
  response_window_seconds: 259200,
  challenge_window_seconds: 15552000,
  bond_lock_seconds: 15552000,
  ownership_recheck_cooldown_seconds: 86400,
  resolution_cooldown_seconds: 86400,
  max_resolution_attempts: 3,
  min_priority_gap_seconds: 3600,
  content_types: ["POST", "THREAD", "ARTICLE", "REPO", "VIDEO", "OTHER"],
};
