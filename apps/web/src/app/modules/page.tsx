'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Stack,
  Button,
  Tooltip,
  Card,
  SimpleGrid,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import {
  IconSmartHome,
  IconNetwork,
  IconFlame,
  IconChevronRight,
  IconChartLine,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { AppNav } from '@/components/AppNav';

interface ModuleEntry {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  href: string;
}

const MODULES: ModuleEntry[] = [
  {
    key: 'boiler',
    label: 'Chaudière',
    description: 'Planning hebdomadaire, dérogation manuelle et protection anti-cycle court pour le relais de la chaudière.',
    icon: <IconFlame size={24} />,
    href: '/modules/boiler',
  },
  {
    key: 'history',
    label: 'Historique',
    description: "Graphiques des valeurs enregistrées pour les appareils historisés, dans le temps.",
    icon: <IconChartLine size={24} />,
    href: '/modules/history',
  },
];

export default function ModulesPage() {
  const router = useRouter();
  const [hostname, setHostname] = useState('localhost');

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

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
        <Stack gap="lg">
          <Title order={4}>Modules</Title>
          <Text size="sm" c="dimmed">
            Fonctionnalités dédiées à un équipement complexe, au-delà d'un simple appareil piloté par scénario.
          </Text>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {MODULES.map((mod) => (
              <UnstyledButton key={mod.key} onClick={() => router.push(mod.href)}>
                <Card shadow="sm" padding="lg" withBorder h="100%">
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon variant="light" size={40} radius="md">
                        {mod.icon}
                      </ThemeIcon>
                      <div>
                        <Text fw={500}>{mod.label}</Text>
                        <Text size="xs" c="dimmed">
                          {mod.description}
                        </Text>
                      </div>
                    </Group>
                    <IconChevronRight size={18} opacity={0.5} />
                  </Group>
                </Card>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
