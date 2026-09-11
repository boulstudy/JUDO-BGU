const P = require("../../app/lib/remoteProtocol.js");

const state = over => ({ v: P.PROTOCOL_VERSION, t: P.MSG.STATE, key: "coach-one", seq: 1, ...over });

describe("admission", () => {
  it("adopts the first key it sees — pairing is trust on first use", () => {
    const r = P.admit(P.releaseGate(), state());
    eq([r.accept, r.reason, r.gate.key], [true, "adopt", "coach-one"]);
  });

  it("keeps taking messages from the phone it adopted", () => {
    const g = P.admit(P.releaseGate(), state()).gate;
    eq(P.admit(g, state({ seq: 2 })).accept, true);
  });

  it("refuses a stranger who found the room code", () => {
    const g = P.admit(P.releaseGate(), state()).gate;
    const r = P.admit(g, state({ key: "someone-else", seq: 99 }));
    eq([r.accept, r.reason], [false, "foreign"]);
    eq(r.gate.key, "coach-one", "a refused message must not move the gate");
  });

  it("drops a replayed anchor that would drag the clock backwards", () => {
    let g = P.admit(P.releaseGate(), state({ seq: 5 })).gate;
    eq(P.admit(g, state({ seq: 5 })).reason, "stale");
    eq(P.admit(g, state({ seq: 4 })).reason, "stale");
    eq(P.admit(g, state({ seq: 6 })).accept, true);
  });

  it("refuses a different protocol version rather than guessing", () => {
    eq(P.admit(P.releaseGate(), state({ v: 1 })).reason, "version");
  });

  it("lets a claim through even from a foreign key — a human still decides", () => {
    const g = P.admit(P.releaseGate(), state()).gate;
    const r = P.admit(g, { v: P.PROTOCOL_VERSION, t: P.MSG.CLAIM, key: "other" });
    eq([r.accept, r.reason], [true, "claim"]);
    eq(r.gate.key, "coach-one", "a claim alone must not hand over the screen");
  });

  it("releasing lets the next phone in", () => {
    const g = P.admit(P.releaseGate(), state()).gate;
    eq(P.admit(P.releaseGate(), state({ key: "new-phone" })).accept, true);
    eq(g.key, "coach-one");
  });

  it("ignores junk", () => {
    eq(P.admit(P.releaseGate(), null).accept, false);
    eq(P.admit(P.releaseGate(), "hello").accept, false);
  });
});

describe("session keys", () => {
  it("are long enough not to be guessed", () => ok(P.makeSessionKey().length >= 16));
  it("differ between sessions", () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(P.makeSessionKey());
    eq(seen.size, 200);
  });
});

describe("state payload", () => {
  it("carries only the keys the screen renders", () => {
    const picked = P.pickState({ drills: [1], notes: "x", secretToken: "nope", pairs: [] });
    eq(Object.keys(picked).sort(), ["drills", "notes", "pairs"]);
  });
  it("tolerates nothing", () => eq(P.pickState(null), {}));
});
