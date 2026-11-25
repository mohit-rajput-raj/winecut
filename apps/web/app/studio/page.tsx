import type { Metadata } from 'next';
import { StudioApp } from '../../components/studio/StudioApp';

export const metadata: Metadata = {
  title: 'Web Studio',
  description:
    'Edit multi-track video timelines, frame 9:16 dual-speaker splits, and export MP4 files in your browser.',
  alternates: {
    canonical: '/studio',
  },
};

export default function StudioPage() {
  return <StudioApp />;
}
