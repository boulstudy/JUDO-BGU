export const metadata = {
  title: 'Judo BGU Trainer',
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, padding: 0, background: '#080a10' }}>
        {children}
      </body>
    </html>
  );
}
