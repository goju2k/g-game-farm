import './global.css';

export const metadata = {
  title: 'roguelite',
  description: 'g-game-farm roguelite — web port',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
