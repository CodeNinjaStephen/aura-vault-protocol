// Root layout — minimal wrapper required by Next.js App Router.
// All locale-specific rendering is handled by app/[locale]/layout.tsx.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
