'use client';

import {
  AppShell,
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
  Tabs,
  TextInput,
  SegmentedControl,
} from '@mantine/core';
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
  IconDevicesPc,
  IconScript,
  IconNetwork,
  IconAntenna,
  IconEdit,
  IconCheck,
  IconLayoutGrid,
  IconGridDots,
  IconLayoutList,
} from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo } from 'react';

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
}

const deviceIcons: Record<string, React.ReactNode> = {
  light: <IconBulb size={24} />,
  switch: <IconToggleLeft size={24} />,
  plug: <IconPlug size={24} />,
  sensor_temperature: <IconTemperature size={24} />,
  sensor_humidity: <IconDroplet size={24} />,
  sensor_motion: <IconWalk size={24} />,
  sensor_door: <IconDoor size={24} />,
  thermostat: <IconAdjustments size={24} />,
};

const groupConfig: { key: string; label: string; icon: React.ReactNode; types: string[] }[] = [
  { key: 'temperature', label: 'Température & Humidité', icon: <IconTemperature size={20} />, types: ['sensor_temperature', 'sensor_humidity'] },
  { key: 'lights', label: 'Éclairage', icon: <IconBulb size={20} />, types: ['light'] },
  { key: 'switches', label: 'Prises & Interrupteurs', icon: <IconPlug size={20} />, types: ['switch', 'plug'] },
  { key: 'motion', label: 'Détection', icon: <IconWalk size={20} />, types: ['sensor_motion', 'sensor_door'] },
  { key: 'climate', label: 'Climat', icon: <IconAdjustments size={20} />, types: ['thermostat', 'sensor_rain', 'sensor_wind', 'sensor_uv'] },
  { key: 'other', label: 'Autres', icon: <IconSmartHome size={20} />, types: [] },
];

function groupDevices(devices: Device[]) {
  const grouped: { key: string; label: string; icon: React.ReactNode; devices: Device[] }[] = [];
  const assigned = new Set<string>();

  for (const group of groupConfig) {
    if (group.key === 'other') continue;
    const matching = devices.filter((d) => group.types.includes(d.type));
    if (matching.length > 0) {
      grouped.push({ ...group, devices: matching });
      matching.forEach((d) => assigned.add(d.id));
    }
  }

  const remaining = devices.filter((d) => !assigned.has(d.id));
  if (remaining.length > 0) {
    const other = groupConfig.find((g) => g.key === 'other')!;
    grouped.push({ ...other, devices: remaining });
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

function DeviceCard({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const state = JSON.parse(device.state || '{}');
  const isOn = state.state === 'ON' || state.on === true;
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(device.name);

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

  const rename = useMutation({
    mutationFn: (name: string) =>
      api.patch(`/devices/${device.id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setEditing(false);
    },
  });

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs" style={{ flex: 1 }}>
          {deviceIcons[device.type] || <IconSmartHome size={24} />}
          {editing ? (
            <TextInput
              size="sm"
              value={editName}
              onChange={(e) => setEditName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename.mutate(editName);
                if (e.key === 'Escape') { setEditing(false); setEditName(device.name); }
              }}
              style={{ flex: 1 }}
              autoFocus
            />
          ) : (
            <Text fw={500}>{device.name}</Text>
          )}
        </Group>
        <Group gap={4}>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => {
              if (editing) {
                rename.mutate(editName);
              } else {
                setEditName(device.name);
                setEditing(true);
              }
            }}
            loading={rename.isPending}
          >
            {editing ? <IconCheck size={14} /> : <IconEdit size={14} />}
          </ActionIcon>
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
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: devices, isLoading } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
    refetchInterval: 5000,
  });

  const groups = useMemo(() => groupDevices(devices ?? []), [devices]);

  const [tileSize, setTileSize] = useState<TileSize>('medium');
  const [hostname, setHostname] = useState('localhost');

  useEffect(() => {
    const saved = localStorage.getItem('skbox-tile-size') as TileSize | null;
    if (saved && ['small', 'medium', 'large'].includes(saved)) {
      setTileSize(saved);
    }
    setHostname(window.location.hostname);
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
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconSmartHome size={28} />
            <Title order={3}>Skbox</Title>
          </Group>
          <Group gap="md">
            <Tabs
              value="devices"
              onChange={(v) => v === 'scenarios' && router.push('/scenarios')}
            >
              <Tabs.List>
                <Tabs.Tab value="devices" leftSection={<IconSmartHome size={16} />}>
                  Appareils
                </Tabs.Tab>
                <Tabs.Tab value="scenarios" leftSection={<IconScript size={16} />}>
                  Scénarios
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
            <Tooltip label="Ouvrir rfxcom2mqtt">
              <Button
                variant="subtle"
                size="sm"
                leftSection={<IconAntenna size={16} />}
                component="a"
                href={`http://${hostname}:8891`}
                target="_blank"
              >
                RFXcom
              </Button>
            </Tooltip>
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
                leftSection={<IconDevicesPc size={16} />}
                loading={permitJoin.isPending}
                onClick={() => permitJoin.mutate(true)}
              >
                Appairer
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
