'use client';

import { Title, Text, Stack, Table, Switch, Badge, MultiSelect } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Theme {
  id: string;
  name: string;
  devices: { id: string }[];
}

interface Device {
  id: string;
  name: string;
  protocol: string;
  type: string;
  status: string;
  room: string | null;
  visible: boolean;
  active: boolean;
  trackHistory: boolean;
}

function DeviceRow({ device, themes }: { device: Device; themes: Theme[] }) {
  const queryClient = useQueryClient();

  const patchDevice = useMutation({
    mutationFn: (data: Partial<Pick<Device, 'visible' | 'active' | 'trackHistory'>>) =>
      api.patch(`/devices/${device.id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  const patchThemes = useMutation({
    mutationFn: (themeIds: string[]) => api.patch(`/devices/${device.id}/themes`, { themeIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['themes'] }),
  });

  const deviceThemeIds = themes.filter((t) => t.devices.some((d) => d.id === device.id)).map((t) => t.id);

  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={500}>
          {device.name}
        </Text>
        <Text size="xs" c="dimmed">
          {device.protocol} · {device.type}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {device.room ?? '—'}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge color={device.status === 'online' ? 'teal' : 'red'} variant="light">
          {device.status}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Switch
          checked={device.visible}
          onChange={(e) => patchDevice.mutate({ visible: e.currentTarget.checked })}
        />
      </Table.Td>
      <Table.Td>
        <Switch
          checked={device.active}
          onChange={(e) => patchDevice.mutate({ active: e.currentTarget.checked })}
        />
      </Table.Td>
      <Table.Td>
        <Switch
          checked={device.trackHistory}
          onChange={(e) => patchDevice.mutate({ trackHistory: e.currentTarget.checked })}
        />
      </Table.Td>
      <Table.Td>
        <MultiSelect
          size="xs"
          placeholder="Thèmes"
          data={themes.map((t) => ({ value: t.id, label: t.name }))}
          value={deviceThemeIds}
          onChange={(value) => patchThemes.mutate(value)}
          w={220}
        />
      </Table.Td>
    </Table.Tr>
  );
}

export default function SettingsDevicesPage() {
  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const { data: themes } = useQuery<Theme[]>({
    queryKey: ['themes'],
    queryFn: () => api.get('/themes').then((r) => r.data),
  });

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Appareils</Title>
        <Text size="sm" c="dimmed">
          Contrôle la visibilité sur le dashboard, l'activation (les messages MQTT sont ignorés pour un
          appareil inactivé), l'historisation des valeurs et l'appartenance aux thèmes.
        </Text>
      </div>

      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Appareil</Table.Th>
            <Table.Th>Pièce</Table.Th>
            <Table.Th>Statut</Table.Th>
            <Table.Th>Visible</Table.Th>
            <Table.Th>Actif</Table.Th>
            <Table.Th>Historiser</Table.Th>
            <Table.Th>Thèmes</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(devices ?? []).map((device) => (
            <DeviceRow key={device.id} device={device} themes={themes ?? []} />
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
