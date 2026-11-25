'use client';

import React, { useSyncExternalStore } from 'react';
import { isTauriRuntime } from '../lib/workspace/storage';
import { LandingPage } from '../components/marketing/LandingPage';
import { StudioApp } from '../components/studio/StudioApp';

const emptySubscribe = () => () => {};

export default function Page() {
  const inDesktopApp = useSyncExternalStore(
    emptySubscribe,
    () => isTauriRuntime(),
    () => false
  );

  if (inDesktopApp) {
    return <StudioApp />;
  }

  return <LandingPage />;
}
