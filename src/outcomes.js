// "Accepted" only means validators agreed. These read the contract back after a write so the
// screen says what actually happened (for example: a check that ran fine but did NOT verify).
import { read } from "./chain.js";
import { OUTCOME_TEXT, OWNERSHIP_RESULT_TEXT } from "./format.js";

export async function ownershipOutcome(workId) {
  const w = await read("get_work", [workId]);
  if (!w || !w.work_id) return null;
  if (w.ownership === "VERIFIED") return "Ownership verified: the proof tag was found in the page's HTML head.";
  return `Not verified. ${OWNERSHIP_RESULT_TEXT[w.ownership_result] || w.ownership_result || "The check did not pass."}`;
}

export async function disputeOutcome(disputeId) {
  const d = await read("get_dispute", [disputeId]);
  if (!d || !d.dispute_id) return null;
  const why = d.rationale || OUTCOME_TEXT[d.outcome_code] || d.outcome_code;
  if (d.status === "OPEN") return `Round recorded, no ruling yet. ${why}`;
  return `Ruling: ${d.status.replace(/_/g, " ").toLowerCase()}. ${why}`;
}
