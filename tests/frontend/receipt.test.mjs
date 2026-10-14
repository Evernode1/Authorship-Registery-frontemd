import test from "node:test";
import assert from "node:assert/strict";
import { assessReceipt, expectedMessage, isCancelledAfterQuorum } from "../../src/receipt.js";

const leader = (execution_result, extra = {}) => ({ consensus_data: { leader_receipt: [{ execution_result, ...extra }] } });

test("explicit SUCCESS passes", () => {
  assert.equal(assessReceipt(leader("SUCCESS")).ok, true);
});

test("an ACCEPTED receipt whose contract code ERRORed is a failure, with the contract's message", () => {
  const r = assessReceipt(leader("ERROR", { genvm_result: { stderr: "[EXPECTED] You cannot dispute your own work" } }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "You cannot dispute your own work");
});

test("an error without a readable message gets a generic one", () => {
  const r = assessReceipt(leader("ERROR"));
  assert.equal(r.ok, false);
  assert.match(r.reason, /rejected/);
});

test("fails closed: a receipt with no recognizable signal is unconfirmed, never success", () => {
  for (const receipt of [{}, { consensus_data: {} }, { consensus_data: { leader_receipt: [{}] } }, null, undefined, "x"]) {
    const r = assessReceipt(receipt);
    assert.equal(r.ok, false);
    assert.equal(r.unconfirmed, true);
  }
});

test("any failing leader receipt fails even if another says SUCCESS", () => {
  const receipt = { consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }, { execution_result: "ERROR" }] } };
  assert.equal(assessReceipt(receipt).ok, false);
});

test("tx-level result name is honored", () => {
  assert.equal(assessReceipt({ txExecutionResultName: "FINISHED_WITH_RETURN" }).ok, true);
  assert.equal(assessReceipt({ txExecutionResultName: "FINISHED_WITH_ERROR" }).ok, false);
});

test("a failing signal beats a passing one from another field", () => {
  const receipt = { txExecutionResultName: "FINISHED_WITH_RETURN", ...leader("ERROR") };
  assert.equal(assessReceipt(receipt).ok, false);
});

test("terminal bad statuses fail", () => {
  assert.equal(assessReceipt({ statusName: "UNDETERMINED", ...leader("SUCCESS") }).ok, false);
  assert.equal(assessReceipt({ statusName: "LEADER_TIMEOUT", ...leader("SUCCESS") }).ok, false);
});

test("[LLM_ERROR] style failures are failures", () => {
  assert.equal(assessReceipt(leader("ERROR", { genvm_result: "[LLM_ERROR] bad json" })).ok, false);
});

test("expectedMessage extracts only the user-facing part", () => {
  assert.equal(expectedMessage('boom [EXPECTED] Ownership is already verified"} trailing'), "Ownership is already verified");
  assert.equal(expectedMessage("nothing here"), "");
});

test("a validator cancelled after quorum does not fail a call the leader executed successfully", () => {
  const receipt = {
    consensus_data: {
      result_name: "MAJORITY_AGREE",
      leader_receipt: [
        { execution_result: "SUCCESS", mode: "leader", genvm_result: { stderr: "", stdout: "" } },
        {
          execution_result: "ERROR",
          mode: "validator",
          vote: "idle",
          genvm_result: {
            stderr: "Validator execution cancelled after quorum",
            raw_error: { fatal: false, causes: ["VALIDATOR_QUORUM_REACHED"] },
            error_code: "CONSENSUS_VALIDATOR_QUORUM_REACHED",
          },
        },
      ],
    },
  };
  assert.equal(isCancelledAfterQuorum(receipt.consensus_data.leader_receipt[1]), true);
  assert.equal(assessReceipt(receipt).ok, true);
});

test("a real contract error is still a failure even when a cancelled validator is present", () => {
  const receipt = {
    consensus_data: {
      leader_receipt: [
        { execution_result: "ERROR", mode: "leader", genvm_result: { stderr: "[EXPECTED] Already registered this URL" } },
        { execution_result: "ERROR", mode: "validator", genvm_result: { stderr: "Validator execution cancelled after quorum" } },
      ],
    },
  };
  const r = assessReceipt(receipt);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "Already registered this URL");
});

