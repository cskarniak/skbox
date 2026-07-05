'use client';

import { Tabs } from '@mantine/core';
import { IconSmartHome, IconScript, IconApps, IconSettings } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

export type AppNavTab = 'devices' | 'scenarios' | 'modules' | 'settings';

export function AppNav({ active }: { active: AppNavTab }) {
  const router = useRouter();

  return (
    <Tabs
      value={active}
      onChange={(v) => {
        if (v === 'devices') router.push('/');
        if (v === 'scenarios') router.push('/scenarios');
        if (v === 'modules') router.push('/modules');
        if (v === 'settings') router.push('/settings');
      }}
    >
      <Tabs.List>
        <Tabs.Tab value="devices" leftSection={<IconSmartHome size={16} />}>
          Appareils
        </Tabs.Tab>
        <Tabs.Tab value="scenarios" leftSection={<IconScript size={16} />}>
          Scénarios
        </Tabs.Tab>
        <Tabs.Tab value="modules" leftSection={<IconApps size={16} />}>
          Modules
        </Tabs.Tab>
        <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
          Réglages
        </Tabs.Tab>
      </Tabs.List>
    </Tabs>
  );
}
