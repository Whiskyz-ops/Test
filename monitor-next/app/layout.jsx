import "./globals.css";

export const metadata = {
  title: "WISING — Monitor",
  description: "Keep track of your exposure around the world."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
