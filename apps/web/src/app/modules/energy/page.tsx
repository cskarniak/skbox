'use client';

import { ActionIcon, AppShell, Group, Stack, Text, Title } from '@mantine/core';
import { IconBolt, IconChevronLeft, IconSmartHome } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';
import { ElectricityCard } from './ElectricityCard';
import { HeatingHistoryCard } from './HeatingHistoryCard';

// Analyse de la consommation d'énergie : électricité (compteur du tableau) et chaudière (temps de
// chauffe), jour par jour. L'historique des déclenchements de la chaudière reste dans son module.
export default function EnergyPage() {
  const router = useRouter();

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconSmartHome size={28} />
            <Title order={3}>Skbox</Title>
          </Group>
          <Group gap="md">
            <AppNav active="modules" />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="lg">
          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={() => router.push('/modules')}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Text size="sm" c="dimmed">
              Modules
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <IconBolt size={18} />
            <Title order={4}>Analyse énergie</Title>
          </Group>

          <ElectricityCard />

          <HeatingHistoryCard />
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
