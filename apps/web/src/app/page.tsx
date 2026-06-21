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
} from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Device {
  id: string;
  name: string;
  protocol: string;
  type: string;
  status: string;
  room: string | null;
  state: string;
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

const statusColors: Record<string, string> = {
  online: 'green',
  offline: 'red',
  pairing: 'yellow',
};

function DeviceCard({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const state = JSON.parse(device.state || '{}');

  const sendCommand = useMutation({
    mutationFn: (command: string) =>
      api.post(`/devices/${device.id}/command`, { command }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          {deviceIcons[device.type] || <IconSmartHome size={24} />}
          <Text fw={500}>{device.name}</Text>
        </Group>
        <Badge color={statusColors[device.status] || 'gray'} variant="light">
          {device.status}
        </Badge>
      </Group>

      <Group gap="xs" mb="sm">
        <Badge variant="outline" size="sm">
          {device.protocol}
        </Badge>
        {device.room && (
          <Badge variant="dot" size="sm">
            {device.room}
          </Badge>
        )}
      </Group>

      {(device.type === 'light' || device.type === 'switch' || device.type === 'plug') && (
        <Group>
          <ActionIcon
            variant={state.on ? 'filled' : 'outline'}
            color={state.on ? 'yellow' : 'gray'}
            size="lg"
            onClick={() => sendCommand.mutate(state.on ? 'off' : 'on')}
            loading={sendCommand.isPending}
          >
            <IconBulb size={18} />
          </ActionIcon>
        </Group>
      )}

      {device.type.startsWith('sensor_') && state.value !== undefined && (
        <Text size="xl" fw={700} c="blue">
          {state.value}
          {device.type === 'sensor_temperature' && '°C'}
          {device.type === 'sensor_humidity' && '%'}
        </Text>
      )}
    </Card>
  );
}

export default function HomePage() {
  const { data: devices, isLoading } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconSmartHome size={28} />
            <Title order={3}>Skbox</Title>
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
                Ajoutez des appareils via l&apos;API ou connectez un bridge
                Zigbee/Matter
              </Text>
            </Stack>
          </Center>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }}>
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </SimpleGrid>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
