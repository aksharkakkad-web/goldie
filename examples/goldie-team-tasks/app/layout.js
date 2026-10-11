import "./globals.css";

export const metadata = {
  title: "Goldie | Team Tasks",
  description: "A shared task board for the Goldie learning IDE team.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
