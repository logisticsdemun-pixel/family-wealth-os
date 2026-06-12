import "./globals.css";

export const metadata = {
  title: "Grey Diary",
  description: "Private family wealth management",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
