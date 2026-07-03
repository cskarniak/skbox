'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Badge,
  Stack,
  Loader,
  Center,
  Button,
  Tabs,
  Tooltip,
  Card,
  SimpleGrid,
  RingProgress,
  Table,
} from '@mantine/core';
import {
  IconSmartHome,
  IconScript,
  IconServer,
  IconNetwork,
  IconCheck,
  IconX,
  IconThermometer,
  IconClock,
  IconWorldWww,
  IconWind,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface ServiceStatus {
  name: string;
  active: boolean;
}

interface DockerContainer {
  name: string;
  status: string;
}

interface SystemHealth {
  hostname: string;
  timestamp: string;
  uptimeSeconds: number;
  loadAvg: [number, number, number];
  cpu: {
    cores: number;
    usagePercent: number;
    governor: string | null;
  };
  temperatures: { label: string; celsius: number }[];
  fans: { label: string; rpm: number; minRpm: number | null; maxRpm: number | null }[];
  memory: {
    totalMB: number;
    usedMB: number;
    usedPercent: number;
  };
  disk: {
    totalGB: number;
    usedGB: number;
    usedPercent: number;
  };
  smart: {
    health: string | null;
    temperatureC: number | null;
    powerOnHours: number | null;
  };
  docker: {
    active: boolean;
    containers: DockerContainer[];
  };
  services: ServiceStatus[];
  network: string[];
}

type Level = 'good' | 'warning' | 'critical';

const LEVEL_COLOR: Record<Level, string> = {
  good: 'teal',
  warning: 'yellow',
  critical: 'red',
};

function percentLevel(percent: number): Level {
  if (percent < 70) return 'good';
  if (percent < 90) return 'warning';
  return 'critical';
}

function tempLevel(celsius: number): Level {
  if (celsius < 65) return 'good';
  if (celsius < 80) return 'warning';
  return 'critical';
}

function StatusBadge({ active, activeLabel = 'Actif', inactiveLabel = 'Arrêté' }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <Badge
      color={active ? LEVEL_COLOR.good : LEVEL_COLOR.critical}
      leftSection={active ? <IconCheck size={12} /> : <IconX size={12} />}
      variant="light"
    >
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

function GaugeCard({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number;
  detail: string;
}) {
  const level = percentLevel(percent);
  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" align="center">
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text size="xl" fw={700}>
            {percent}%
          </Text>
          <Text size="xs" c="dimmed">
            {detail}
          </Text>
        </Stack>
        <RingProgress
          size={80}
          thickness={8}
          roundCaps
          sections={[{ value: percent, color: LEVEL_COLOR[level] }]}
          label={
            <Center>
              {level === 'critical' ? (
                <IconX size={18} color="var(--mantine-color-red-6)" />
              ) : level === 'warning' ? (
                <IconThermometer size={18} color="var(--mantine-color-yellow-6)" />
              ) : (
                <IconCheck size={18} color="var(--mantine-color-teal-6)" />
              )}
            </Center>
          }
        />
      </Group>
    </Card>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}min`);
  return parts.join(' ');
}

export default function SystemPage() {
  const router = useRouter();
  const [hostname, setHostname] = useState('localhost');

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ['system-health'],
    queryFn: () => api.get('/system/health').then((r) => r.data),
    refetchInterval: 10000,
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
            <Tabs
              value="system"
              onChange={(v) => {
                if (v === 'devices') router.push('/');
                if (v === 'scenarios') router.push('/scenarios');
              }}
            >
              <Tabs.List>
                <Tabs.Tab value="devices" leftSection={<IconSmartHome size={16} />}>
                  Appareils
                </Tabs.Tab>
                <Tabs.Tab value="scenarios" leftSection={<IconScript size={16} />}>
                  Scénarios
                </Tabs.Tab>
                <Tabs.Tab value="system" leftSection={<IconServer size={16} />}>
                  Système
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>
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
        <Group justify="space-between" mb="md">
          <Title order={4}>Santé du serveur</Title>
          {health && (
            <Text size="xs" c="dimmed">
              {health.hostname} — mis à jour {new Date(health.timestamp).toLocaleTimeString('fr-FR')}
            </Text>
          )}
        </Group>

        {isLoading || !health ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : (
          <Stack gap="lg">
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              <GaugeCard
                label="Charge CPU"
                percent={health.cpu.usagePercent}
                detail={`${health.cpu.cores} cœurs · load ${health.loadAvg
                  .map((n) => n.toFixed(2))
                  .join(' / ')}`}
              />
              <GaugeCard
                label="Mémoire"
                percent={health.memory.usedPercent}
                detail={`${health.memory.usedMB} / ${health.memory.totalMB} Mo`}
              />
              <GaugeCard
                label="Disque"
                percent={health.disk.usedPercent}
                detail={`${health.disk.usedGB} / ${health.disk.totalGB} Go`}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
              <Card shadow="sm" padding="lg" withBorder>
                <Text size="sm" c="dimmed" mb="xs">
                  Températures
                </Text>
                {health.temperatures.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Aucune sonde détectée
                  </Text>
                ) : (
                  <Stack gap={6}>
                    {health.temperatures.map((t) => (
                      <Group justify="space-between" key={t.label}>
                        <Text size="sm">{t.label}</Text>
                        <Badge
                          color={LEVEL_COLOR[tempLevel(t.celsius)]}
                          variant="light"
                          leftSection={<IconThermometer size={12} />}
                        >
                          {t.celsius}°C
                        </Badge>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Card>

              <Card shadow="sm" padding="lg" withBorder>
                <Text size="sm" c="dimmed" mb="xs">
                  Ventilateur
                </Text>
                {health.fans.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Aucun ventilateur détecté
                  </Text>
                ) : (
                  <Stack gap={6}>
                    {health.fans.map((f) => (
                      <Group justify="space-between" key={f.label}>
                        <Text size="sm">{f.label}</Text>
                        <Badge color="blue" variant="light" leftSection={<IconWind size={12} />}>
                          {f.rpm} RPM
                        </Badge>
                      </Group>
                    ))}
                    {health.fans[0]?.minRpm !== null && health.fans[0]?.maxRpm !== null && (
                      <Text size="xs" c="dimmed">
                        Plage : {health.fans[0].minRpm} – {health.fans[0].maxRpm} RPM
                      </Text>
                    )}
                  </Stack>
                )}
              </Card>

              <Card shadow="sm" padding="lg" withBorder>
                <Text size="sm" c="dimmed" mb="xs">
                  Disque SSD (SMART)
                </Text>
                <Stack gap={6}>
                  <Group justify="space-between">
                    <Text size="sm">État</Text>
                    <Badge
                      color={
                        health.smart.health === 'PASSED'
                          ? LEVEL_COLOR.good
                          : LEVEL_COLOR.critical
                      }
                      variant="light"
                    >
                      {health.smart.health ?? 'inconnu'}
                    </Badge>
                  </Group>
                  {health.smart.temperatureC !== null && (
                    <Group justify="space-between">
                      <Text size="sm">Température</Text>
                      <Badge
                        color={LEVEL_COLOR[tempLevel(health.smart.temperatureC)]}
                        variant="light"
                      >
                        {health.smart.temperatureC}°C
                      </Badge>
                    </Group>
                  )}
                  {health.smart.powerOnHours !== null && (
                    <Group justify="space-between">
                      <Text size="sm">Heures de fonctionnement</Text>
                      <Text size="sm" c="dimmed">
                        {health.smart.powerOnHours} h
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Card>

              <Card shadow="sm" padding="lg" withBorder>
                <Text size="sm" c="dimmed" mb="xs">
                  Machine
                </Text>
                <Stack gap={6}>
                  <Group justify="space-between">
                    <Text size="sm">
                      <IconClock size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Uptime
                    </Text>
                    <Text size="sm" c="dimmed">
                      {formatUptime(health.uptimeSeconds)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">
                      <IconWorldWww size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Réseau
                    </Text>
                    <Text size="sm" c="dimmed">
                      {health.network.join(', ') || '—'}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Gouverneur CPU</Text>
                    <Text size="sm" c="dimmed">
                      {health.cpu.governor ?? '—'}
                    </Text>
                  </Group>
                </Stack>
              </Card>
            </SimpleGrid>

            <Card shadow="sm" padding="lg" withBorder>
              <Text size="sm" c="dimmed" mb="xs">
                Services
              </Text>
              <Group gap="xs" wrap="wrap">
                {health.services.map((s) => (
                  <Badge
                    key={s.name}
                    color={s.active ? LEVEL_COLOR.good : LEVEL_COLOR.critical}
                    leftSection={s.active ? <IconCheck size={12} /> : <IconX size={12} />}
                    variant="light"
                  >
                    {s.name}
                  </Badge>
                ))}
              </Group>
            </Card>

            <Card shadow="sm" padding="lg" withBorder>
              <Group justify="space-between" mb="xs">
                <Text size="sm" c="dimmed">
                  Docker
                </Text>
                <StatusBadge active={health.docker.active} />
              </Group>
              {health.docker.containers.length > 0 && (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Conteneur</Table.Th>
                      <Table.Th>Statut</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {health.docker.containers.map((c) => (
                      <Table.Tr key={c.name}>
                        <Table.Td>{c.name}</Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {c.status}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </Stack>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
