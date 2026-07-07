'use client';

import {
  AppShell,
  Box,
  Group,
  Title,
  Text,
  SimpleGrid,
  Card,
  Badge,
  ActionIcon,
  Stack,
  Loader,
  Center,
  Tooltip,
  Slider,
  Button,
  SegmentedControl,
  Modal,
  Select,
  Table,
  ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconSmartHome,
  IconBulb,
  IconPlug,
  IconTemperature,
  IconDoor,
  IconWalk,
  IconDroplet,
  IconAdjustments,
  IconToggleLeft,
  IconBolt,
  IconDevicesPc,
  IconLayoutGrid,
  IconGridDots,
  IconLayoutList,
  IconCategory,
  IconChartLine,
} from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo } from 'react';
import { AppNav } from '@/components/AppNav';
import { ValueChart } from '@/components/ValueChart';
import { LatestValue } from '@/components/LatestValue';
import {
  CHART_COLORS,
  DeviceEvent,
  DisplayType,
  extractValueKeys,
  buildSeries,
  formatValueLabel,
  formatDateTime,
  latestValue,
  parseDisplayPreferences,
} from '@/lib/history';

interface Device {
  id: string;
  name: string;
  protocol: string;
  type: string;
  status: string;
  room: string | null;
  state: string;
  vendor: string | null;
  model: string | null;
  ieeeAddress: string | null;
  lastSeen: string;
  visible: boolean;
  active: boolean;
  trackHistory: boolean;
  displayPreferences: string;
}

interface Theme {
  id: string;
  name: string;
  order: number;
  devices: { id: string }[];
}

const deviceIcons: Record<string, React.ReactNode> = {
  light: <IconBulb size={24} />,
  switch: <IconToggleLeft size={24} />,
  plug: <IconPlug size={24} />,
  sensor_temperature: <IconTemperature size={24} />,
  sensor_humidity: <IconDroplet size={24} />,
  sensor_motion: <IconWalk size={24} />,
  sensor_door: <IconDoor size={24} />,
  sensor_power: <IconBolt size={24} />,
  thermostat: <IconAdjustments size={24} />,
};

function groupDevices(devices: Device[], themes: Theme[]) {
  const visibleDevices = devices.filter((d) => d.visible && d.active);
  const grouped: { key: string; label: string; icon: React.ReactNode; devices: Device[] }[] = [];
  const assigned = new Set<string>();

  const sortedThemes = [...themes].sort((a, b) => a.order - b.order);
  for (const theme of sortedThemes) {
    const themeDeviceIds = new Set(theme.devices.map((d) => d.id));
    const matching = visibleDevices.filter((d) => themeDeviceIds.has(d.id));
    if (matching.length > 0) {
      grouped.push({ key: theme.id, label: theme.name, icon: <IconCategory size={20} />, devices: matching });
      matching.forEach((d) => assigned.add(d.id));
    }
  }

  const remaining = visibleDevices.filter((d) => !assigned.has(d.id));
  if (remaining.length > 0) {
    grouped.push({ key: 'other', label: 'Sans thème', icon: <IconSmartHome size={20} />, devices: remaining });
  }

  return grouped;
}

const statusColors: Record<string, string> = {
  online: 'green',
  offline: 'red',
  pairing: 'yellow',
};

type TileSize = 'small' | 'medium' | 'large';

const tileSizeCols: Record<TileSize, Record<string, number>> = {
  small:  { base: 2, sm: 3, md: 4, lg: 6 },
  medium: { base: 1, sm: 2, md: 3, lg: 4 },
  large:  { base: 1, sm: 1, md: 2, lg: 3 },
};

const HISTORY_RANGE_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: '0.5', label: '30 min' },
  { value: '1', label: 'Heure' },
  { value: '24', label: 'Jour' },
  { value: '168', label: 'Semaine' },
  { value: '720', label: 'Mois' },
  { value: '8760', label: 'Année' },
];

function HistoryValueTable({ series }: { series: { time: number; value: number }[] }) {
  return (
    <ScrollArea.Autosize mah={320}>
      <Table stickyHeader striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date / Heure</Table.Th>
            <Table.Th>Valeur</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {[...series]
            .reverse()
            .map((point) => (
              <Table.Tr key={point.time}>
                <Table.Td>{formatDateTime(point.time)}</Table.Td>
                <Table.Td>{point.value}</Table.Td>
              </Table.Tr>
            ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  );
}

function DeviceHistoryModal({ device, opened, onClose }: { device: Device; opened: boolean; onClose: () => void }) {
  const [rangeHours, setRangeHours] = useState('168');
  const [valueKey, setValueKey] = useState<string | null>(null);
  const [displayType, setDisplayType] = useState<DisplayType>('chart');
  // Bascule locale Graphique/Liste par valeur : n'écrase pas la préférence enregistrée
  // dans Réglages > Appareils, juste ce qui est affiché dans cette modale.
  const [viewOverrides, setViewOverrides] = useState<Record<string, 'chart' | 'table'>>({});

  const fromIso = useMemo(
    () => (rangeHours ? new Date(Date.now() - parseFloat(rangeHours) * 3600_000).toISOString() : undefined),
    [rangeHours],
  );

  const { data: history, isLoading } = useQuery<DeviceEvent[]>({
    queryKey: ['device-history', device.id, fromIso],
    queryFn: () => api.get(`/devices/${device.id}/history`, { params: { maxPoints: 500, from: fromIso } }).then((r) => r.data),
    enabled: opened,
  });

  const prefs = parseDisplayPreferences(device.displayPreferences);
  const valueKeys = history ? extractValueKeys(history) : [];
  const activeKey = valueKey && valueKeys.includes(valueKey) ? valueKey : valueKeys[0] ?? null;
  const series = history && activeKey ? buildSeries(history, activeKey) : [];

  return (
    <Modal opened={opened} onClose={onClose} title={`Historique — ${device.name}`} size="lg">
      <Stack gap="md">
        <SegmentedControl size="xs" value={rangeHours} onChange={setRangeHours} data={HISTORY_RANGE_OPTIONS} />

        {isLoading ? (
          <Center h={220}>
            <Loader size="sm" />
          </Center>
        ) : prefs.length > 0 ? (
          <Stack gap="md">
            {prefs.map((pref) => {
              const effectiveType = pref.displayType === 'value' ? 'value' : viewOverrides[pref.valueKey] ?? pref.displayType;
              return (
                <Stack key={pref.valueKey} gap={4}>
                  <Group justify="space-between" wrap="wrap">
                    <Text size="xs" c="dimmed">
                      {formatValueLabel(pref.valueKey)}
                    </Text>
                    {pref.displayType !== 'value' && (
                      <SegmentedControl
                        size="xs"
                        value={effectiveType}
                        onChange={(value) =>
                          setViewOverrides((prev) => ({ ...prev, [pref.valueKey]: value as 'chart' | 'table' }))
                        }
                        data={[
                          { label: 'Graphique', value: 'chart' },
                          { label: 'Liste', value: 'table' },
                        ]}
                      />
                    )}
                  </Group>
                  {effectiveType === 'value' ? (
                    <LatestValue valueKey={pref.valueKey} value={history ? latestValue(history, pref.valueKey) : null} />
                  ) : (
                    (() => {
                      const prefSeries = history ? buildSeries(history, pref.valueKey) : [];
                      return prefSeries.length === 0 ? (
                        <Center h={220}>
                          <Text size="sm" c="dimmed">
                            Aucune donnée pour cette période.
                          </Text>
                        </Center>
                      ) : effectiveType === 'table' ? (
                        <HistoryValueTable series={prefSeries} />
                      ) : (
                        <ValueChart
                          series={prefSeries}
                          chartType={pref.chartType ?? 'line'}
                          color={CHART_COLORS[0]}
                          valueKey={pref.valueKey}
                        />
                      );
                    })()
                  )}
                </Stack>
              );
            })}
          </Stack>
        ) : (
          <Stack gap="md">
            <Group gap="sm" wrap="wrap">
              <Select
                size="xs"
                placeholder="Valeur"
                data={valueKeys.map((k) => ({ value: k, label: formatValueLabel(k) }))}
                value={activeKey}
                onChange={setValueKey}
                w={200}
                disabled={valueKeys.length === 0}
              />
              <SegmentedControl
                size="xs"
                value={displayType}
                onChange={(value) => setDisplayType(value as DisplayType)}
                data={[
                  { label: 'Graphique', value: 'chart' },
                  { label: 'Liste', value: 'table' },
                ]}
              />
            </Group>
            {!activeKey || series.length === 0 ? (
              <Center h={220}>
                <Text size="sm" c="dimmed">
                  Aucune donnée pour cette période.
                </Text>
              </Center>
            ) : displayType === 'table' ? (
              <HistoryValueTable series={series} />
            ) : (
              <ValueChart series={series} chartType="area" color={CHART_COLORS[0]} valueKey={activeKey} />
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

function DeviceCard({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const state = JSON.parse(device.state || '{}');
  const isOn = state.state === 'ON' || state.on === true;
  const [historyOpened, { open: openHistory, close: closeHistory }] = useDisclosure(false);

  const sendCommand = useMutation({
    mutationFn: (command: string) =>
      api.post(`/devices/${device.id}/command`, { command }),
    onMutate: async (command: string) => {
      await queryClient.cancelQueries({ queryKey: ['devices'] });
      const previous = queryClient.getQueryData<Device[]>(['devices']);

      if (command === 'on' || command === 'off') {
        queryClient.setQueryData<Device[]>(['devices'], (old) =>
          old?.map((d) => {
            if (d.id !== device.id) return d;
            const nextState = { ...JSON.parse(d.state || '{}'), state: command === 'on' ? 'ON' : 'OFF' };
            return { ...d, state: JSON.stringify(nextState) };
          }),
        );
      }

      return { previous };
    },
    onError: (_err, _command, context) => {
      if (context?.previous) queryClient.setQueryData(['devices'], context.previous);
    },
  });

  const setBrightness = useMutation({
    mutationFn: (value: number) =>
      api.post(`/devices/${device.id}/command`, {
        command: 'brightness',
        payload: { value },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs" style={{ flex: 1 }}>
          {deviceIcons[device.type] || <IconSmartHome size={24} />}
          <Text fw={500}>{device.name}</Text>
        </Group>
        <Group gap={4}>
          {device.trackHistory && (
            <>
              <Tooltip label="Voir l'historique">
                <ActionIcon variant="subtle" size="sm" onClick={openHistory}>
                  <IconChartLine size={14} />
                </ActionIcon>
              </Tooltip>
              <DeviceHistoryModal device={device} opened={historyOpened} onClose={closeHistory} />
            </>
          )}
          <Badge color={statusColors[device.status] || 'gray'} variant="light">
            {device.status}
          </Badge>
        </Group>
      </Group>

      <Group gap="xs" mb="xs">
        <Badge variant="outline" size="sm">
          {device.protocol}
        </Badge>
        {device.room && (
          <Badge variant="dot" size="sm">
            {device.room}
          </Badge>
        )}
      </Group>

      {(device.vendor || device.model) && (
        <Text size="xs" c="dimmed" mb="sm">
          {[device.vendor, device.model].filter(Boolean).join(' — ')}
        </Text>
      )}

      {(device.type === 'light' || device.type === 'switch' || device.type === 'plug') && (
        <Stack gap="xs">
          <Group>
            <ActionIcon
              variant={isOn ? 'filled' : 'outline'}
              color={isOn ? 'yellow' : 'gray'}
              size="lg"
              onClick={() => sendCommand.mutate(isOn ? 'off' : 'on')}
              loading={sendCommand.isPending}
            >
              <IconBulb size={18} />
            </ActionIcon>
            <Text size="sm" c="dimmed">
              {isOn ? 'Allumé' : 'Éteint'}
            </Text>
          </Group>

          {device.type === 'light' && state.brightness !== undefined && (
            <Tooltip label={`Luminosité: ${Math.round((state.brightness / 254) * 100)}%`}>
              <Slider
                value={state.brightness}
                min={1}
                max={254}
                size="sm"
                onChangeEnd={(value) => setBrightness.mutate(value)}
              />
            </Tooltip>
          )}
        </Stack>
      )}

      {device.type === 'sensor_temperature' && (
        <Group gap="md">
          <Text size="xl" fw={700} c="blue">
            {state.temperature !== undefined ? `${state.temperature}°C` : '—'}
          </Text>
          {state.humidity !== undefined && (
            <Text size="xl" fw={700} c="cyan">
              {state.humidity}%
            </Text>
          )}
        </Group>
      )}

      {device.type === 'sensor_humidity' && (
        <Text size="xl" fw={700} c="cyan">
          {state.humidity !== undefined ? `${state.humidity}%` : '—'}
        </Text>
      )}

      {device.type === 'sensor_motion' && (
        <Badge size="lg" color={state.occupancy ? 'orange' : 'gray'} variant="light">
          {state.occupancy ? 'Mouvement détecté' : 'Aucun mouvement'}
        </Badge>
      )}

      {device.type === 'sensor_door' && (
        <Badge size="lg" color={state.contact === false ? 'red' : 'green'} variant="light">
          {state.contact === false ? 'Ouvert' : 'Fermé'}
        </Badge>
      )}

      {device.type === 'sensor_power' && (
        <Group gap="md">
          <Text size="xl" fw={700} c="orange">
            {state.power !== undefined ? `${state.power} W` : '—'}
          </Text>
          {state.energy !== undefined && (
            <Text size="sm" c="dimmed">
              {state.energy.toFixed(2)} Wh
            </Text>
          )}
        </Group>
      )}

      {state.battery !== undefined && device.protocol !== 'rf433' && (
        <Text size="xs" c="dimmed" mt="xs">
          Batterie : {state.battery}%
        </Text>
      )}

      {state.battery !== undefined && device.protocol === 'rf433' && (
        <Badge size="sm" variant="light" color={state.battery > 50 ? 'green' : 'red'} mt="xs">
          Pile {state.battery > 50 ? 'OK' : 'faible'}
        </Badge>
      )}

      {state.linkquality !== undefined && (
        <Text size="xs" c="dimmed">
          Signal : {state.linkquality}/255
        </Text>
      )}

      {state.rssi !== undefined && (
        <Text size="xs" c="dimmed">
          Signal : {state.rssi}/10
        </Text>
      )}
    </Card>
  );
}

export default function HomePage() {
  const queryClient = useQueryClient();

  const { data: devices, isLoading } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: themes } = useQuery<Theme[]>({
    queryKey: ['themes'],
    queryFn: () => api.get('/themes').then((r) => r.data),
  });

  const groups = useMemo(() => groupDevices(devices ?? [], themes ?? []), [devices, themes]);

  const [tileSize, setTileSize] = useState<TileSize>('medium');

  useEffect(() => {
    const saved = localStorage.getItem('skbox-tile-size') as TileSize | null;
    if (saved && ['small', 'medium', 'large'].includes(saved)) {
      setTileSize(saved);
    }
  }, []);

  const handleTileSizeChange = (value: string) => {
    const size = value as TileSize;
    setTileSize(size);
    localStorage.setItem('skbox-tile-size', size);
  };

  const permitJoin = useMutation({
    mutationFn: (enable: boolean) =>
      api.post('/zigbee/permit-join', { enable, duration: 120 }),
  });

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconSmartHome size={28} />
            <Title order={3} visibleFrom="sm">Skbox</Title>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <AppNav active="devices" />
            <SegmentedControl
              size="xs"
              value={tileSize}
              onChange={handleTileSizeChange}
              data={[
                { label: <IconLayoutList size={14} />, value: 'large' },
                { label: <IconLayoutGrid size={14} />, value: 'medium' },
                { label: <IconGridDots size={14} />, value: 'small' },
              ]}
            />
            <Tooltip label="Autoriser l'appairage Zigbee pendant 2 min">
              <Button
                variant="light"
                size="sm"
                px="xs"
                leftSection={<IconDevicesPc size={16} />}
                loading={permitJoin.isPending}
                onClick={() => permitJoin.mutate(true)}
              >
                <Box visibleFrom="sm">Appairer</Box>
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {isLoading ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : !devices?.length ? (
          <Center h={200}>
            <Stack align="center" gap="xs">
              <IconSmartHome size={48} opacity={0.5} />
              <Text c="dimmed">Aucun appareil connecté</Text>
              <Text c="dimmed" size="sm">
                Cliquez sur &quot;Appairer&quot; pour ajouter un appareil
                Zigbee, ou connectez un bridge Matter
              </Text>
            </Stack>
          </Center>
        ) : (
          <Stack gap="xl">
            {groups.map((group) => (
              <div key={group.key}>
                <Group gap="xs" mb="sm">
                  {group.icon}
                  <Title order={4}>{group.label}</Title>
                  <Badge variant="light" size="sm">{group.devices.length}</Badge>
                </Group>
                <SimpleGrid cols={tileSizeCols[tileSize]}>
                  {group.devices.map((device) => (
                    <DeviceCard key={device.id} device={device} />
                  ))}
                </SimpleGrid>
              </div>
            ))}
          </Stack>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
