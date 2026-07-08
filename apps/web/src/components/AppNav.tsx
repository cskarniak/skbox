'use client';

import { Box, Tabs } from '@mantine/core';
import { IconSmartHome, IconScript, IconApps, IconSettings, IconDevicesPc } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

export type AppNavTab = 'devices' | 'appareils' | 'scenarios' | 'modules' | 'settings';

export function AppNav({ active }: { active: AppNavTab }) {
  const router = useRouter();

  return (
    <Tabs
      value={active}
      onChange={(v) => {
        if (v === 'devices') router.push('/');
        if (v === 'appareils') router.push('/devices');
        if (v === 'scenarios') router.push('/scenarios');
        if (v === 'modules') router.push('/modules');
        if (v === 'settings') router.push('/settings');
      }}
    >
      <Tabs.List style={{ flexWrap: 'nowrap' }}>
        <Tabs.Tab value="devices" leftSection={<IconSmartHome size={16} />}>
          <Box visibleFrom="sm">Dashboard</Box>
        </Tabs.Tab>
        <Tabs.Tab value="appareils" leftSection={<IconDevicesPc size={16} />}>
          <Box visibleFrom="sm">Appareils</Box>
        </Tabs.Tab>
        <Tabs.Tab value="scenarios" leftSection={<IconScript size={16} />}>
          <Box visibleFrom="sm">Scénarios</Box>
        </Tabs.Tab>
        <Tabs.Tab value="modules" leftSection={<IconApps size={16} />}>
          <Box visibleFrom="sm">Modules</Box>
        </Tabs.Tab>
        <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
          <Box visibleFrom="sm">Réglages</Box>
        </Tabs.Tab>
      </Tabs.List>
    </Tabs>
  );
}
