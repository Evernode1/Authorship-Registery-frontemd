// Decides whether a GenLayer transaction receipt means "the contract call ran and succeeded".
//
// A transaction can reach ACCEPTED (validators agreed on a result) even though the contract code
// itself failed: an agreed ERROR is still an agreement. So reaching ACCEPTED is not success.
// This check FAILS CLOSED: a receipt is only treated as successful when it carries an affirmative
// success signal and no failure signal. A receipt with no recognizable signal is "unconfirmed",
// never "done".

const OK = new Set(["SUCCESS", "FINISHED_WITH_RETURN", "RETURN"]);
const BAD_STATUS = /^(UNDETERMINED|CANCELED|CANCELLED|LEADER_TIMEOUT|VALIDATORS_TIMEOUT|UNKNOWN)$/;

const upper = (v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);

/** True for a validator entry that was cancelled after quorum (e.g. "Validator execution cancelled after quorum"). */
export function isCancelledAfterQuorum(entry) {
  const g = entry?.genvm_result ?? {};
  if (g.error_code === "CONSENSUS_VALIDATOR_QUORUM_REACHED") return true;
  const causes = g.raw_error?.causes;
  if (Array.isArray(causes) && causes.includes("VALIDATOR_QUORUM_REACHED")) return true;
  return typeof g.stderr === "string" && /cancelled after quorum/i.test(g.stderr);
}

/** Pulls the human message the contract puts after [EXPECTED], if any. */
export function expectedMessage(value) {
  let text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  } catch {
    text = String(value);
  }
  const m = text.match(/\[EXPECTED\]\s*([^\n"\\]+)/);
  return m ? m[1].trim() : "";
}

export function assessReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") {
    return { ok: false, unconfirmed: true, reason: "The network returned no receipt for this transaction." };
  }

  const status = upper(receipt.statusName ?? receipt.status_name);
  if (status && BAD_STATUS.test(status)) {
    return { ok: false, reason: `The network ended this transaction as ${status}.` };
  }

  const leader = receipt?.consensus_data?.leader_receipt;
  const leaders = Array.isArray(leader) ? leader : leader ? [leader] : [];
  const signals = [];
  for (const l of leaders) {
    // A validator that was cancelled because the quorum was already reached did not decide anything.
    // It is not a failure of the contract call, so it must not override the decisive receipts.
    if (isCancelledAfterQuorum(l)) continue;
    const v = upper(l?.execution_result) ?? upper(l?.result?.status);
    if (v) signals.push({ value: v, raw: l });
  }
  const tx = upper(receipt.txExecutionResultName ?? receipt.tx_execution_result_name);
  if (tx) signals.push({ value: tx, raw: receipt });

  const failing = signals.find((s) => !OK.has(s.value));
  if (failing) {
    return {
      ok: false,
      code: failing.value,
      reason: expectedMessage(failing.raw) || "The contract rejected this call.",
    };
  }
  if (signals.length === 0) {
    return {
      ok: false,
      unconfirmed: true,
      reason: "The network accepted the transaction, but its receipt did not say whether the contract call succeeded, so it is not shown as done. Check the transaction in the explorer.",
    };
  }
  return { ok: true };
}
