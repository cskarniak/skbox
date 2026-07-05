'use client';

import { AppShell, Group, Title, Button, Tooltip, Tabs } from '@mantine/core';
import { IconSmartHome, IconNetwork, IconAdjustments, IconServer, IconDatabaseExport } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { AppNav } from '@/components/AppNav';

const SUB_TABS = [
  { value: 'preferences', label: 'Préférences', icon: <IconAdjustments size={16} />, href: '/settings/preferences' },
  { value: 'system', label: 'Système', icon: <IconServer size={16} />, href: '/settings/system' },
  { value: 'backup', label: 'Sauvegardes', icon: <IconDatabaseExport size={16} />, href: '/settings/backup' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hostname, setHostname] = useState('localhost');

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const activeSubTab = SUB_TABS.find((t) => pathname.startsWith(t.href))?.value ?? 'preferences';

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconSmartHome size={28} />
            <Title order={3}>Skbox</Title>
          </Group>
          <Group gap="md">
            <AppNav active="settings" />
            <Tooltip label="Ouvrir Zigbee2MQTT">
              <Button
                variant="subtle"
                size="sm"
                leftSection={<IconNetwork size={16} />}
                component="a"
                href={`http://${hostname}:8080`}
                target="_blank"
              >
                Z2M
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Tabs
          value={activeSubTab}
          onChange={(v) => {
            const tab = SUB_TABS.find((t) => t.value === v);
            if (tab) router.push(tab.href);
          }}
          mb="md"
        >
          <Tabs.List>
            {SUB_TABS.map((tab) => (
              <Tabs.Tab key={tab.value} value={tab.value} leftSection={tab.icon}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        {children}
      </AppShell.Main>
    </AppShell>
  );
}
