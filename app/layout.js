import "./globals.css";

export const metadata = {
  title: "Family Wealth OS",
  description: "Private family wealth management",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
