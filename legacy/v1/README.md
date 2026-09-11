# v1 — retired in phase 2

The TV-owns-the-clock design: `/` was the projected display and source of
truth, `/remote` was a thin phone remote. Replaced in phase 2 by the
phone-first design (`/` is the coach app, `/tv` is a dumb projection receiver
deriving its clock from an anchor).

Kept here for reference only — **not built, not routed, not tested**.
`app/lib/roomCode.js`, `app/lib/remoteBus.js` and `app/lib/shared.js` are
still shared with v2 and were *not* moved here; everything in this folder is
what changed or was replaced.

| file | was | replaced by |
|---|---|---|
| `JudoTrainer.jsx` | `/` — the TV | `app/tv/ProjectionReceiver.jsx` + `app/lib/ProjectionScreen.jsx` |
| `RemoteControl.jsx` | `/remote` — the phone remote | `app/coach/CoachApp.jsx` and friends |
| `linkV1.js` | `useTvLink` / `useRemoteLink` | `app/lib/sessionLink.js` + `app/lib/projectionLink.js` |
| `remoteProtocolV1.js` | tick-based wire protocol | `app/lib/remoteProtocol.js` (anchor-based) |
| `e2e-remote.js`, `e2e-clock.js` | 35 tests against `/` + `/remote` | `test/e2e-projection.js` (14) + `test/unit/sessionEngine.test.js` (39) |
