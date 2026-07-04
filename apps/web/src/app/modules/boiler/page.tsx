'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Badge,
  Stack,
  Button,
  Tabs,
  Tooltip,
  Card,
  Select,
  TextInput,
  NumberInput,
  ActionIcon,
} from '@mantine/core';
import {
  IconSmartHome,
  IconScript,
  IconServer,
  IconNetwork,
  IconDatabaseExport,
  IconApps,
  IconFlame,
  IconPlus,
  IconTrash,
  IconChevronLeft,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Device {
  id: string;
  name: string;
  protocol: string;
  type: string;
  room: string | null;
}

interface BoilerSlot {
  day: number;
  from: string;
  to: string;
}

interface BoilerConfig {
  deviceId: string | null;
  schedule: BoilerSlot[];
  minOnMinutes: number;
  minOffMinutes: number;
}

interface BoilerOverride {
  mode: 'on' | 'off';
  until: string;
}

interface BoilerStatus {
  deviceId: string | null;
  deviceName: string | null;
  deviceOnline: boolean;
  commandedState: 'ON' | 'OFF' | null;
  desiredState: 'ON' | 'OFF';
  scheduleActive: boolean;
  override: BoilerOverride | null;
  lastChangeAt: string | null;
}

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export default function BoilerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [hostname, setHostname] = useState('localhost');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<BoilerSlot[]>([]);
  const [minOnMinutes, setMinOnMinutes] = useState(10);
  const [minOffMinutes, setMinOffMinutes] = useState(5);
  const [boostMinutes, setBoostMinutes] = useState(60);

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const { data: config } = useQuery<BoilerConfig>({
    queryKey: ['boiler-config'],
    queryFn: () => api.get('/boiler/config').then((r) => r.data),
  });

  useEffect(() => {
    if (config) {
      setDeviceId(config.deviceId);
      setSchedule(config.schedule);
      setMinOnMinutes(config.minOnMinutes);
      setMinOffMinutes(config.minOffMinutes);
    }
  }, [config]);

  const { data: status } = useQuery<BoilerStatus>({
    queryKey: ['boiler-status'],
    queryFn: () => api.get('/boiler/status').then((r) => r.data),
    refetchInterval: 15000,
  });

  const saveConfig = useMutation({
    mutationFn: (next: BoilerConfig) => api.put('/boiler/config', next).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boiler-config'] });
      queryClient.invalidateQueries({ queryKey: ['boiler-status'] });
      notifications.show({ color: 'teal', title: 'Enregistré', message: 'Configuration chaudière mise à jour' });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec',
        message: error?.response?.data?.message ?? "Impossible d'enregistrer",
      });
    },
  });

  const boost = useMutation({
    mutationFn: (mode: 'on' | 'off') =>
      api.post('/boiler/boost', { mode, minutes: boostMinutes }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boiler-status'] }),
  });

  const clearBoost = useMutation({
    mutationFn: () => api.delete('/boiler/boost').then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boiler-status'] }),
  });

  const handleSaveConfig = () => {
    saveConfig.mutate({ deviceId, schedule, minOnMinutes, minOffMinutes });
  };

  const addSlot = (day: number) => {
    setSchedule((prev) => [...prev, { day, from: '06:00', to: '22:00' }]);
  };

  const updateSlot = (index: number, patch: Partial<BoilerSlot>) => {
    setSchedule((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeSlot = (index: number) => {
    setSchedule((prev) => prev.filter((_, i) => i !== index));
  };

  const deviceOptions = (devices ?? [])
    .filter((d) => d.type === 'switch' || d.type === 'plug')
    .map((d) => ({ value: d.id, label: d.room ? `${d.name} (${d.room})` : d.name }));

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
              value="modules"
              onChange={(v) => {
                if (v === 'devices') router.push('/');
                if (v === 'scenarios') router.push('/scenarios');
                if (v === 'system') router.push('/system');
                if (v === 'backup') router.push('/backup');
                if (v === 'modules') router.push('/modules');
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
                <Tabs.Tab value="backup" leftSection={<IconDatabaseExport size={16} />}>
                  Sauvegarde
                </Tabs.Tab>
                <Tabs.Tab value="modules" leftSection={<IconApps size={16} />}>
                  Modules
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
            <IconFlame size={18} />
            <Title order={4}>Chaudière</Title>
          </Group>

          <Card shadow="sm" padding="lg" withBorder>
            <Text size="sm" c="dimmed" mb="xs">
              Appareil relais
            </Text>
            <Select
              placeholder="Choisir le relais Shelly (Zigbee)"
              data={deviceOptions}
              value={deviceId}
              onChange={setDeviceId}
              searchable
              clearable
            />
            {!deviceId && (
              <Text size="xs" c="dimmed" mt={4}>
                Appaire le module Shelly S4SW en mode Zigbee via Zigbee2MQTT, puis sélectionne-le ici.
              </Text>
            )}
          </Card>

          {status && (
            <Card shadow="sm" padding="lg" withBorder>
              <Group justify="space-between" mb="xs">
                <Text size="sm" c="dimmed">
                  État actuel
                </Text>
                <Badge color={status.commandedState === 'ON' ? 'teal' : 'gray'} variant="light">
                  {status.commandedState ?? 'inconnu'}
                </Badge>
              </Group>
              <Stack gap={6}>
                <Group justify="space-between">
                  <Text size="sm">Mode</Text>
                  <Badge color={status.override ? 'orange' : 'blue'} variant="light">
                    {status.override ? 'dérogation manuelle' : 'planning'}
                  </Badge>
                </Group>
                {status.override && (
                  <Text size="xs" c="dimmed">
                    Forcé sur {status.override.mode === 'on' ? 'MARCHE' : 'ARRÊT'} jusqu'à{' '}
                    {new Date(status.override.until).toLocaleString('fr-FR')}
                  </Text>
                )}
                <Group justify="space-between">
                  <Text size="sm">Planning actif maintenant</Text>
                  <Text size="sm" c="dimmed">
                    {status.scheduleActive ? 'oui' : 'non'}
                  </Text>
                </Group>
                {status.lastChangeAt && (
                  <Text size="xs" c="dimmed">
                    Dernier changement : {new Date(status.lastChangeAt).toLocaleString('fr-FR')}
                  </Text>
                )}

                <Group mt="xs" align="flex-end">
                  <NumberInput
                    label="Durée (min)"
                    w={110}
                    min={1}
                    max={1440}
                    value={boostMinutes}
                    onChange={(v) => setBoostMinutes(typeof v === 'number' ? v : 60)}
                  />
                  <Button
                    size="xs"
                    color="teal"
                    variant="light"
                    loading={boost.isPending && boost.variables === 'on'}
                    onClick={() => boost.mutate('on')}
                  >
                    Forcer marche
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    loading={boost.isPending && boost.variables === 'off'}
                    onClick={() => boost.mutate('off')}
                  >
                    Forcer arrêt
                  </Button>
                  {status.override && (
                    <Button
                      size="xs"
                      variant="subtle"
                      loading={clearBoost.isPending}
                      onClick={() => clearBoost.mutate()}
                    >
                      Annuler la dérogation
                    </Button>
                  )}
                </Group>
              </Stack>
            </Card>
          )}

          <Card shadow="sm" padding="lg" withBorder>
            <Text size="sm" c="dimmed" mb="xs">
              Protection anti-cycle court
            </Text>
            <Group>
              <NumberInput
                label="Durée mini ON (min)"
                min={0}
                max={180}
                value={minOnMinutes}
                onChange={(v) => setMinOnMinutes(typeof v === 'number' ? v : 0)}
                w={160}
              />
              <NumberInput
                label="Durée mini OFF (min)"
                min={0}
                max={180}
                value={minOffMinutes}
                onChange={(v) => setMinOffMinutes(typeof v === 'number' ? v : 0)}
                w={160}
              />
            </Group>
          </Card>

          <Card shadow="sm" padding="lg" withBorder>
            <Text size="sm" c="dimmed" mb="sm">
              Planning hebdomadaire
            </Text>
            <Stack gap="md">
              {DAYS.map((label, day) => (
                <Group key={day} align="flex-start" wrap="nowrap">
                  <Text size="sm" fw={500} w={90}>
                    {label}
                  </Text>
                  <Stack gap={6} style={{ flex: 1 }}>
                    {schedule
                      .map((slot, index) => ({ slot, index }))
                      .filter(({ slot }) => slot.day === day)
                      .map(({ slot, index }) => (
                        <Group key={index} gap="xs">
                          <TextInput
                            size="xs"
                            w={80}
                            value={slot.from}
                            onChange={(e) => updateSlot(index, { from: e.currentTarget.value })}
                            placeholder="06:00"
                          />
                          <Text size="xs" c="dimmed">
                            à
                          </Text>
                          <TextInput
                            size="xs"
                            w={80}
                            value={slot.to}
                            onChange={(e) => updateSlot(index, { to: e.currentTarget.value })}
                            placeholder="22:00"
                          />
                          <ActionIcon variant="subtle" color="red" size="sm" onClick={() => removeSlot(index)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      ))}
                    <ActionIcon variant="subtle" size="sm" onClick={() => addSlot(day)}>
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Stack>
                </Group>
              ))}
            </Stack>
          </Card>

          <Group justify="flex-end">
            <Button loading={saveConfig.isPending} onClick={handleSaveConfig}>
              Enregistrer
            </Button>
          </Group>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
