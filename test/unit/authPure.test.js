const A = require("../../app/lib/authPure.js");

describe("needsRefresh", () => {
  it("treats a missing session as needing refresh", () => {
    eq(A.needsRefresh(null), true);
    eq(A.needsRefresh({}), true);
  });

  it("is false with plenty of time left", () => {
    eq(A.needsRefresh({ expires_at: 1_000_000 + 20 * 60 * 1000 }, 1_000_000), false);
  });

  it("is true inside the refresh window", () => {
    eq(A.needsRefresh({ expires_at: 1_000_000 + 4 * 60 * 1000 }, 1_000_000), true);
  });

  it("is true once already expired", () => {
    eq(A.needsRefresh({ expires_at: 999_000 }, 1_000_000), true);
  });
});

describe("toSession", () => {
  it("computes an absolute expiry from expires_in", () => {
    const s = A.toSession({ access_token: "a", refresh_token: "r", expires_in: 3600, user: { id: "u1" } }, 1_000_000);
    eq(s.access_token, "a");
    eq(s.expires_at, 1_000_000 + 3600 * 1000);
    eq(s.user.id, "u1");
  });

  it("defaults to an hour when the server omits expires_in", () => {
    eq(A.toSession({ access_token: "a" }, 0).expires_at, 3600 * 1000);
  });

  it("returns null for a response with no token — email confirmation pending", () => {
    eq(A.toSession({ user: { id: "u1" } }), null);
    eq(A.toSession(null), null);
  });
});

describe("describeAuthError", () => {
  it("gives a Hebrew message for a duplicate signup", () => {
    ok(A.describeAuthError(400, { error_description: "User already registered" }).includes("רשומה"));
  });
  it("gives a Hebrew message for bad credentials", () => {
    ok(A.describeAuthError(400, { error_description: "Invalid login credentials" }).includes("שגויים"));
  });
  it("flags a network failure distinctly from a server error", () => {
    ok(A.describeAuthError(0, null).includes("רשת"));
    ok(A.describeAuthError(500, null).includes("שרת"));
  });
  it("falls back to the raw message when nothing matches", () => {
    eq(A.describeAuthError(400, { error_description: "something else" }), "something else");
  });
});
