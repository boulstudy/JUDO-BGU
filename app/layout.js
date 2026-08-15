export const metadata = {
  title: 'Judo BGU Trainer',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#080a10',
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-fullscreen" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#080a10' }}>
        {children}
      </body>
    </html>
  );
}
