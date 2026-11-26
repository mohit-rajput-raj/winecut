import type { Metadata } from 'next';
import { DownloadDirectory } from '../../components/marketing/DownloadDirectory';

export const metadata: Metadata = {
  title: 'Download Installers',
  description:
    'Download Winecut desktop installers for Windows (.exe, .msi), macOS (.dmg), and Linux (.AppImage, .deb).',
  alternates: {
    canonical: '/download',
  },
};

export default function DownloadPage() {
  return <DownloadDirectory />;
}
