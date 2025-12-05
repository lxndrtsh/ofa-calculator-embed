export const metadata = { title: 'HPP Embed Host' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{margin:0, fontFamily:'Lato, system-ui, -apple-system, Segoe UI, sans-serif'}}>
        {children}
      </body>
    </html>
  );
}
