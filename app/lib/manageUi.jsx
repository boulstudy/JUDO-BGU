// Shared look for the club-management screens (/clubs, /clubs/[id], and
// later /clubs/[id]/catalog, /plans, /teams) — same visual language as the
// TV and remote, just laid out for reading/managing instead of a live clock.

export const ORANGE = "#FF6B00";

export const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14,
  padding: 18,
};

export const btn = (bg, color, border) => ({
  background: bg,
  border: border || "1px solid rgba(255,255,255,0.09)",
  color,
  borderRadius: 10,
  padding: "11px 16px",
  cursor: "pointer",
  fontFamily: "Heebo,sans-serif",
  fontWeight: 700,
  fontSize: 14,
});

export const input = {
  width: "100%",
  background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  color: "#fff",
  padding: "12px 14px",
  fontFamily: "Heebo,sans-serif",
  fontSize: 15,
  outline: "none",
};

export function Shell({ children, maxWidth = 640 }) {
  return (
    <div style={{
      minHeight: "100dvh", width: "100%", background: "#080a10", direction: "rtl",
      color: "#fff", fontFamily: "Heebo,sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&family=Oswald:wght@700&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box}
        input::placeholder{color:rgba(255,255,255,0.3)}
        button{font-family:Heebo,sans-serif}
      `}</style>
      <div style={{ maxWidth, margin: "0 auto", padding: "clamp(20px,5vw,44px) 20px 60px" }}>
        {children}
      </div>
    </div>
  );
}
