'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Stack,
  Card,
  SimpleGrid,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { IconSmartHome, IconFlame, IconChevronRight, IconChartLine, IconVideo, IconAlertTriangle, IconCloudRain, IconAntenna, IconBulb } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
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
  {
    key: 'cameras',
    label: 'Caméras',
    description: 'Vue en direct des caméras IP (flux RTSP relayé via go2rtc).',
    icon: <IconVideo size={24} />,
    href: '/modules/cameras',
  },
  {
    key: 'alarms',
    label: 'Alarmes',
    description: 'Surveillance de capteurs (eau, fumée...) avec notification et historique des déclenchements.',
    icon: <IconAlertTriangle size={24} />,
    href: '/modules/alarms',
  },
  {
    key: 'weather',
    label: 'Météo',
    description: 'Prévisions à 7 jours, tendance des températures et de la pression, pour préparer vos sorties à vélo.',
    icon: <IconCloudRain size={24} />,
    href: '/modules/weather',
  },
  {
    key: 'presence',
    label: 'Simulation de présence',
    description: "Allumage/extinction de lampes à horaires semi-aléatoires (fixes ou solaires) pour simuler une présence, avec journal et vérification quotidienne.",
    icon: <IconBulb size={24} />,
    href: '/modules/presence',
  },
  {
    key: 'network-health',
    label: 'Santé réseau',
    description: 'Qualité des liaisons du maillage Zigbee, pour repérer les appareils mal reliés avant qu\'ils ne posent problème.',
    icon: <IconAntenna size={24} />,
    href: '/modules/network-health',
  },
];

export default function ModulesPage() {
  const router = useRouter();

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconSmartHome size={28} />
            <Title order={3} visibleFrom="sm">Skbox</Title>
          </Group>
          <Group gap="md" wrap="nowrap">
            <AppNav active="modules" />
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
