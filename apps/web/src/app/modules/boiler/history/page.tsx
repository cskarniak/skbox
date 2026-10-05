'use client';

import { ActionIcon, AppShell, Group, Stack, Text, Title } from '@mantine/core';
import { IconChevronLeft, IconFlame, IconSmartHome } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';
import { HeatingHistoryCard } from '../HeatingHistoryCard';
import { BoilerEventsCard } from '../BoilerEventsCard';

// Analyse des temps de chauffe et historique des déclenchements : séparés de la page Chaudière
// pour que le planning et la régulation (l'essentiel) restent lisibles sans défiler.
export default function BoilerHistoryPage() {
  const router = useRouter();

  const { data: levelLabels } = useQuery<Record<string, string>>({
    queryKey: ['boiler-levels'],
    queryFn: () => api.get('/boiler/levels').then((r) => r.data),
    staleTime: Infinity,
  });

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
            <ActionIcon variant="subtle" onClick={() => router.push('/modules/boiler')}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Text size="sm" c="dimmed">
              Modules
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <IconFlame size={18} />
            <Text size="sm" c="dimmed">
              Chaudière
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Title order={4}>Analyse et historique</Title>
          </Group>

          <HeatingHistoryCard />

          <BoilerEventsCard levelLabels={levelLabels} />
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
