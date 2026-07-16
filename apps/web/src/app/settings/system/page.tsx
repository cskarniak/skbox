'use client';

import {
  Group,
  Title,
  Text,
  Badge,
  Stack,
  Loader,
  Center,
  Button,
  Card,
  SimpleGrid,
  RingProgress,
  Table,
  Select,
  Modal,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCheck,
  IconX,
  IconThermometer,
  IconClock,
  IconWorldWww,
  IconWind,
  IconShieldCheck,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  bridges: {
    zigbee: boolean;
    rfxcom: boolean;
  };
  tailscale: {
    connected: boolean;
    backendState: string | null;
    ips: string[];
  };
  network: string[];
  thermalShutdown: {
    active: boolean;
    limitCelsius: number | null;
    lastCheckAt: string | null;
    lastTempCelsius: number | null;
  };
}

interface ServiceEvent {
  id: string;
  service: string;
  event: string;
  detail: string | null;
  createdAt: string;
}

const SERVICE_LABELS: Record<string, string> = {
  zigbee: 'Zigbee2MQTT',
  rfxcom: 'rfxcom2mqtt',
  tailscale: 'Tailscale',
  system: 'Skbox (machine)',
};

const EVENT_LABELS: Record<string, string> = {
  offline: 'Hors-ligne',
  reconnected: 'Reconnecté',
  auto_restart: 'Relance auto',
  manual_stop: 'Arrêt manuel (test)',
  manual_start: 'Démarrage manuel',
  manual_restart: 'Redémarrage manuel',
  manual_reboot: 'Redémarrage machine (manuel)',
  boot: 'Démarrage machine',
};

const EVENT_COLOR: Record<string, string> = {
  offline: 'red',
  reconnected: 'teal',
  auto_restart: 'blue',
  manual_stop: 'orange',
  manual_start: 'teal',
  manual_restart: 'blue',
  manual_reboot: 'red',
  boot: 'grape',
};

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

const REFRESH_OPTIONS = [
  { value: '5000', label: '5 s' },
  { value: '10000', label: '10 s' },
  { value: '30000', label: '30 s' },
  { value: '60000', label: '1 min' },
];

const REFRESH_SETTING_KEY = 'system-refresh-interval';

export default function SettingsSystemPage() {
  const queryClient = useQueryClient();
  const [refreshInterval, setRefreshInterval] = useState(10000);

  const { data: refreshSetting } = useQuery<{ value: string | null }>({
    queryKey: ['settings', REFRESH_SETTING_KEY],
    queryFn: () =>
      api.get(`/settings/${REFRESH_SETTING_KEY}`).then((r) => r.data),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (
      refreshSetting?.value &&
      REFRESH_OPTIONS.some((o) => o.value === refreshSetting.value)
    ) {
      setRefreshInterval(parseInt(refreshSetting.value, 10));
    }
  }, [refreshSetting]);

  const updateRefreshInterval = useMutation({
    mutationFn: (value: string) =>
      api.put(`/settings/${REFRESH_SETTING_KEY}`, { value }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['settings', REFRESH_SETTING_KEY] }),
  });

  const handleRefreshIntervalChange = (value: string | null) => {
    if (!value) return;
    setRefreshInterval(parseInt(value, 10));
    updateRefreshInterval.mutate(value);
  };

  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ['system-health'],
    queryFn: () => api.get('/system/health').then((r) => r.data),
    refetchInterval: refreshInterval,
  });

  const [journalOpened, { open: openJournal, close: closeJournal }] = useDisclosure(false);

  const { data: events, isLoading: eventsLoading } = useQuery<ServiceEvent[]>({
    queryKey: ['system-events'],
    queryFn: () => api.get('/system/events?limit=100').then((r) => r.data),
    refetchInterval: journalOpened ? refreshInterval : false,
    enabled: journalOpened,
  });

  const setThermalShutdown = useMutation({
    mutationFn: (active: boolean) =>
      api.put('/system/thermal-shutdown', { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-health'] }),
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec de la commande',
        message:
          error?.response?.data?.message ??
          "La commande sudo a échoué sur le serveur (règle sudoers manquante ?)",
      });
    },
  });

  const handleThermalShutdownToggle = (active: boolean) => {
    if (
      !active &&
      !window.confirm(
        'Désactiver la protection thermique ? Le serveur ne s\'arrêtera plus automatiquement en cas de surchauffe.',
      )
    ) {
      return;
    }
    setThermalShutdown.mutate(active);
  };

  const stopBridge = useMutation({
    mutationFn: (bridge: 'zigbee' | 'rfxcom') => api.post(`/system/bridges/${bridge}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      queryClient.invalidateQueries({ queryKey: ['system-events'] });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec de la commande',
        message:
          error?.response?.data?.message ??
          "La commande sudo a échoué sur le serveur (règle sudoers manquante ?)",
      });
    },
  });

  const handleStopBridge = (bridge: 'zigbee' | 'rfxcom') => {
    const serviceName = bridge === 'zigbee' ? 'skbox-z2m' : 'skbox-rfxcom';
    if (
      !window.confirm(
        `Arrêter le service ${serviceName} pour tester la relance automatique ? Le bridge sera hors-ligne jusqu'à la relance (automatique si activée dans Préférences, sinon manuelle).`,
      )
    ) {
      return;
    }
    stopBridge.mutate(bridge);
  };

  const restartBridge = useMutation({
    mutationFn: (bridge: 'zigbee' | 'rfxcom') => api.post(`/system/bridges/${bridge}/restart`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      queryClient.invalidateQueries({ queryKey: ['system-events'] });
      notifications.show({ color: 'teal', message: 'Redémarrage lancé' });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec de la commande',
        message:
          error?.response?.data?.message ??
          "La commande sudo a échoué sur le serveur (règle sudoers manquante ?)",
      });
    },
  });

  const handleRestartBridge = (bridge: 'zigbee' | 'rfxcom') => {
    const serviceName = bridge === 'zigbee' ? 'skbox-z2m' : 'skbox-rfxcom';
    if (!window.confirm(`Redémarrer le service ${serviceName} ? Le bridge sera brièvement hors-ligne le temps du redémarrage.`)) {
      return;
    }
    restartBridge.mutate(bridge);
  };

  const startTailscale = useMutation({
    mutationFn: () => api.post('/system/tailscale/start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      queryClient.invalidateQueries({ queryKey: ['system-events'] });
      notifications.show({ color: 'teal', message: 'tailscaled démarré.' });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec de la commande',
        message:
          error?.response?.data?.message ??
          "La commande sudo a échoué sur le serveur (règle sudoers manquante ?)",
      });
    },
  });

  const stopTailscale = useMutation({
    mutationFn: () => api.post('/system/tailscale/stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      queryClient.invalidateQueries({ queryKey: ['system-events'] });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec de la commande',
        message:
          error?.response?.data?.message ??
          "La commande sudo a échoué sur le serveur (règle sudoers manquante ?)",
      });
    },
  });

  const handleStopTailscale = () => {
    const isRemote = typeof window !== 'undefined' && /\.ts\.net$|^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(window.location.hostname);
    const warning = isRemote
      ? "\n\n⚠️ Vous semblez accéder à Skbox via Tailscale : ce test va couper votre propre accès jusqu'à la relance automatique (ou une relance manuelle depuis le réseau local)."
      : '';
    if (
      !window.confirm(
        `Arrêter le service tailscaled pour tester la relance automatique ?${warning}`,
      )
    ) {
      return;
    }
    stopTailscale.mutate();
  };

  const rebootServer = useMutation({
    mutationFn: () => api.post('/system/reboot'),
    onSuccess: () => {
      notifications.show({
        color: 'orange',
        title: 'Redémarrage lancé',
        message: 'La machine redémarre — tous les services (API, Web, bridges) seront brièvement indisponibles.',
      });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec de la commande',
        message:
          error?.response?.data?.message ??
          "La commande sudo a échoué sur le serveur (règle sudoers manquante ?)",
      });
    },
  });

  const handleRebootServer = () => {
    if (
      !window.confirm(
        'Redémarrer complètement le serveur Skbox ?\n\nTous les services (API, Web, Zigbee, RFXcom, caméras, Tailscale...) seront coupés le temps du redémarrage de la machine (généralement 1 à 2 minutes). À utiliser uniquement si trop de services sont down pour être relancés individuellement.',
      )
    ) {
      return;
    }
    rebootServer.mutate();
  };

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={4}>Santé du serveur</Title>
        <Group gap="md">
          {health && (
            <Text size="xs" c="dimmed">
              {health.hostname} — mis à jour {new Date(health.timestamp).toLocaleTimeString('fr-FR')}
            </Text>
          )}
          <Select
            size="xs"
            w={100}
            label={null}
            value={String(refreshInterval)}
            onChange={handleRefreshIntervalChange}
            data={REFRESH_OPTIONS}
            allowDeselect={false}
          />
        </Group>
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
            <Text size="sm" c="dimmed" mb="xs">
              Bridges (état fonctionnel, pas juste le process)
            </Text>
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="sm">Zigbee2MQTT</Text>
                <Group gap="xs">
                  <StatusBadge active={health.bridges.zigbee} activeLabel="En ligne" inactiveLabel="Hors-ligne" />
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    loading={restartBridge.isPending && restartBridge.variables === 'zigbee'}
                    disabled={stopBridge.isPending || restartBridge.isPending}
                    onClick={() => handleRestartBridge('zigbee')}
                  >
                    Redémarrer
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    disabled={!health.bridges.zigbee || stopBridge.isPending || restartBridge.isPending}
                    loading={stopBridge.isPending && stopBridge.variables === 'zigbee'}
                    onClick={() => handleStopBridge('zigbee')}
                  >
                    Tester l'arrêt
                  </Button>
                </Group>
              </Group>
              <Group justify="space-between">
                <Text size="sm">rfxcom2mqtt</Text>
                <Group gap="xs">
                  <StatusBadge active={health.bridges.rfxcom} activeLabel="En ligne" inactiveLabel="Hors-ligne" />
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    loading={restartBridge.isPending && restartBridge.variables === 'rfxcom'}
                    disabled={stopBridge.isPending || restartBridge.isPending}
                    onClick={() => handleRestartBridge('rfxcom')}
                  >
                    Redémarrer
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    disabled={!health.bridges.rfxcom || stopBridge.isPending || restartBridge.isPending}
                    loading={stopBridge.isPending && stopBridge.variables === 'rfxcom'}
                    onClick={() => handleStopBridge('rfxcom')}
                  >
                    Tester l'arrêt
                  </Button>
                </Group>
              </Group>
            </Stack>
          </Card>

          <Card shadow="sm" padding="lg" withBorder>
            <Text size="sm" c="dimmed" mb="xs">
              Accès distant (Tailscale)
            </Text>
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="sm">
                  tailscaled
                  {health.tailscale.ips.length > 0 && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · {health.tailscale.ips.join(', ')}
                    </Text>
                  )}
                </Text>
                <Group gap="xs">
                  <StatusBadge
                    active={health.tailscale.connected}
                    activeLabel="Connecté"
                    inactiveLabel={health.tailscale.backendState ?? 'Déconnecté'}
                  />
                  <Button
                    size="xs"
                    variant="light"
                    color="teal"
                    disabled={health.tailscale.connected || startTailscale.isPending || stopTailscale.isPending}
                    loading={startTailscale.isPending}
                    onClick={() => startTailscale.mutate()}
                  >
                    Démarrer
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    disabled={!health.tailscale.connected || startTailscale.isPending || stopTailscale.isPending}
                    loading={stopTailscale.isPending}
                    onClick={handleStopTailscale}
                  >
                    Tester l'arrêt
                  </Button>
                </Group>
              </Group>
            </Stack>
          </Card>

          <Card shadow="sm" padding="lg" withBorder>
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed">
                <IconShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Activation script de sécurité
              </Text>
              <StatusBadge active={health.thermalShutdown.active} />
            </Group>
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="sm">Seuil d'arrêt</Text>
                <Text size="sm" c="dimmed">
                  {health.thermalShutdown.limitCelsius !== null
                    ? `${health.thermalShutdown.limitCelsius}°C`
                    : '—'}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Dernière vérification</Text>
                <Text size="sm" c="dimmed">
                  {health.thermalShutdown.lastTempCelsius !== null
                    ? `${health.thermalShutdown.lastTempCelsius}°C`
                    : '—'}
                  {health.thermalShutdown.lastCheckAt &&
                    ` — ${new Date(health.thermalShutdown.lastCheckAt).toLocaleTimeString('fr-FR')}`}
                </Text>
              </Group>
              <Button
                size="xs"
                mt={4}
                color={health.thermalShutdown.active ? 'red' : 'teal'}
                variant="light"
                loading={setThermalShutdown.isPending}
                onClick={() => handleThermalShutdownToggle(!health.thermalShutdown.active)}
              >
                {health.thermalShutdown.active ? 'Désactiver' : 'Activer'}
              </Button>
            </Stack>
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

          <Card shadow="sm" padding="lg" withBorder>
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed">
                  Machine ({health.hostname})
                </Text>
                <Text size="xs" c="dimmed">
                  Redémarre le serveur entier — à utiliser si trop de services sont down.
                </Text>
              </div>
              <Button
                size="xs"
                variant="light"
                color="red"
                loading={rebootServer.isPending}
                onClick={handleRebootServer}
              >
                Redémarrer le serveur
              </Button>
            </Group>
          </Card>

          <Card shadow="sm" padding="lg" withBorder>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Journal des arrêts et redémarrages
              </Text>
              <Button size="xs" variant="light" onClick={openJournal}>
                Voir le journal
              </Button>
            </Group>
          </Card>
        </Stack>
      )}

      <Modal opened={journalOpened} onClose={closeJournal} title="Journal des arrêts et redémarrages" size="lg">
        {eventsLoading ? (
          <Center h={80}>
            <Loader size="sm" />
          </Center>
        ) : !events || events.length === 0 ? (
          <Text size="sm" c="dimmed">
            Aucun événement enregistré
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Service</Table.Th>
                <Table.Th>Événement</Table.Th>
                <Table.Th>Détail</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {events.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {new Date(e.createdAt).toLocaleString('fr-FR')}
                    </Text>
                  </Table.Td>
                  <Table.Td>{SERVICE_LABELS[e.service] ?? e.service}</Table.Td>
                  <Table.Td>
                    <Badge color={EVENT_COLOR[e.event] ?? 'gray'} variant="light">
                      {EVENT_LABELS[e.event] ?? e.event}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {e.detail ?? '—'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Modal>
    </>
  );
}
