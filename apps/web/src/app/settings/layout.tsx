'use client';

import { AppShell, Box, Group, Title, Button, Tooltip, Tabs } from '@mantine/core';
import {
  IconSmartHome,
  IconNetwork,
  IconAntenna,
  IconAdjustments,
  IconServer,
  IconDatabaseExport,
  IconDevicesPc,
  IconCategory,
  IconLogs,
  IconTool,
} from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { AppNav } from '@/components/AppNav';

const SUB_TABS = [
  { value: 'preferences', label: 'Préférences', icon: <IconAdjustments size={16} />, href: '/settings/preferences' },
  { value: 'pairing', label: 'Appairage', icon: <IconDevicesPc size={16} />, href: '/settings/pairing' },
  { value: 'themes', label: 'Thèmes', icon: <IconCategory size={16} />, href: '/settings/themes' },
  { value: 'mqtt-logs', label: 'Logs MQTT', icon: <IconLogs size={16} />, href: '/settings/mqtt-logs' },
  { value: 'tools', label: 'Outils', icon: <IconTool size={16} />, href: '/settings/tools' },
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
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconSmartHome size={28} />
            <Title order={3} visibleFrom="sm">Skbox</Title>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <AppNav active="settings" />
            <Tooltip label="Ouvrir Zigbee2MQTT">
              <Button
                variant="subtle"
                size="sm"
                px="xs"
                leftSection={<IconNetwork size={16} />}
                component="a"
                href={`http://${hostname}:8080`}
                target="_blank"
              >
                <Box visibleFrom="sm">Z2M</Box>
              </Button>
            </Tooltip>
            <Tooltip label="Ouvrir rfxcom2mqtt">
              <Button
                variant="subtle"
                size="sm"
                px="xs"
                leftSection={<IconAntenna size={16} />}
                component="a"
                href={`http://${hostname}:8891`}
                target="_blank"
              >
                <Box visibleFrom="sm">RFXcom</Box>
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
          <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
            {SUB_TABS.map((tab) => (
              <Tabs.Tab key={tab.value} value={tab.value} leftSection={tab.icon} style={{ flexShrink: 0 }}>
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
