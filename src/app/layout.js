import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Homelab Hub',
  description: 'Dashboard intranet per la rete di casa',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      {
        url: '/icons/favicon-32.webp',
        type: 'image/webp',
        sizes: '32x32',
      },
      {
        url: '/icons/favicon-32.png',
        type: 'image/png',
        sizes: '32x32',
      },
      {
        url: '/icons/favicon-192.webp',
        type: 'image/webp',
        sizes: '192x192',
      },
      {
        url: '/icons/favicon-192.png',
        type: 'image/png',
        sizes: '192x192',
      },
      {
        url: '/icons/favicon-512.webp',
        type: 'image/webp',
        sizes: '512x512',
      },
      {
        url: '/icons/favicon-512.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    apple: [
      { url: '/icons/favicon-180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/favicon-180.webp', sizes: '180x180', type: 'image/webp' },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body className={inter.className}>{children}</body>
    </html>
  );
}