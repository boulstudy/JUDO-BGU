export const metadata = {
  title: 'Judo BGU Trainer',
};

const card = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  width: '100%',
  maxWidth: 380,
  padding: '30px 20px',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
  textDecoration: 'none',
  fontFamily: 'Heebo,sans-serif',
};

export default function Home() {
  return (
    <div style={{
      minHeight: '100dvh', width: '100%', background: '#080a10', direction: 'rtl',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 34, padding: '32px 20px', boxSizing: 'border-box',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap" rel="stylesheet" />

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🥋</div>
        <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, fontFamily: 'Heebo,sans-serif' }}>נבחרת ג׳ודו BGU</div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, marginTop: 6, fontFamily: 'Heebo,sans-serif' }}>
          בטלויזיה בוחרים הקרנה, בנייד ניהול מערך אימון
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 380 }}>
        <a href="/display" style={{ ...card, border: '1px solid rgba(255,107,0,0.35)', background: 'rgba(255,107,0,0.08)' }}>
          <span style={{ fontSize: 40 }}>🖥️</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#FF6B00' }}>הקרנה</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>המסך המוקרן באולם — כאן על הטלויזיה</span>
        </a>

        <a href="/remote" style={card}>
          <span style={{ fontSize: 40 }}>📋</span>
          <span style={{ fontSize: 20, fontWeight: 900 }}>ניהול מערך אימון</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>השלט הפרטי — כאן על הנייד</span>
        </a>
      </div>

      <a href="/clubs" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'Heebo,sans-serif', textDecoration: 'none' }}>
        🗂️ ניהול מועדונים (בטא)
      </a>
    </div>
  );
}
