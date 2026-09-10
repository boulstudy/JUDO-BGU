const R = require("../../app/lib/roomCode.js");

describe("room codes", () => {
  it("are six characters — the code is the only lock on a public channel", () => {
    eq(R.makeRoomCode().length, 6);
  });

  it("never contain the pairs people misread across a hall", () => {
    let joined = "";
    for (let i = 0; i < 400; i++) joined += R.makeRoomCode();
    eq(/[O0I1]/.test(joined), false);
  });

  it("spread across the alphabet rather than repeating", () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(R.makeRoomCode());
    ok(seen.size > 495, "expected near-unique codes, got " + seen.size + "/500");
  });

  it("normalise what a coach actually types", () => {
    eq(R.normalizeRoomCode(" a7k-2q p "), "A7K2QP");
    eq(R.normalizeRoomCode(null), "");
  });

  it("accept a full code and reject a partial one", () => {
    eq(R.isValidRoomCode("A7K2QP"), true);
    eq(R.isValidRoomCode("A7K2"), false);
    eq(R.isValidRoomCode(""), false);
  });

  it("name the characters a code can never hold, so the phone can say why", () => {
    eq(R.impossibleChars("A0K1QP"), ["0", "1"]);
    eq(R.impossibleChars("A7K2QP"), []);
  });

  it("keep two codes on separate topics", () => {
    ok(R.roomTopic("A7K2QP") !== R.roomTopic("A7K2QQ"));
    eq(R.roomTopic("a7k2qp"), R.roomTopic("A7K2QP"));
  });
});
