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
  SimpleGrid,
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
  IconTemperature,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type LevelKey = 'eco' | 'confort' | 'confort_plus' | 'vacances' | 'nuit';

const LEVEL_ORDER: LevelKey[] = ['vacances', 'eco', 'nuit', 'confort', 'confort_plus'];

const LEVEL_COLORS: Record<LevelKey, string> = {
  vacances: 'grape',
  eco: 'blue',
  nuit: 'indigo',
  confort: 'teal',
  confort_plus: 'green',
};

interface Device {
  id: string;
  name: string;
  protocol: string;
  type: string;
  room: string | null;
}

interface ProgramSlot {
  from: string;
  to: string;
  level: LevelKey;
}

interface BoilerProgram {
  id: string;
  name: string;
  slots: ProgramSlot[];
}

type DayPrograms = Record<number, string | null>;

interface BoilerConfig {
  deviceId: string | null;
  temperatureSensorId: string | null;
  hysteresis: number;
  levels: Record<LevelKey, number>;
  defaultLevel: LevelKey;
  programs: BoilerProgram[];
  dayPrograms: DayPrograms;
  minOnMinutes: number;
  minOffMinutes: number;
}

interface BoilerOverride {
  level: LevelKey;
  until: string;
}

interface BoilerStatus {
  deviceId: string | null;
  deviceName: string | null;
  deviceOnline: boolean;
  commandedState: 'ON' | 'OFF' | null;
  desiredState: 'ON' | 'OFF';
  activeLevel: LevelKey;
  targetTemp: number;
  currentTemp: number | null;
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
  const [temperatureSensorId, setTemperatureSensorId] = useState<string | null>(null);
  const [hysteresis, setHysteresis] = useState(0.3);
  const [levels, setLevels] = useState<Record<LevelKey, number>>({
    eco: 17,
    confort: 19,
    confort_plus: 21,
    vacances: 12,
    nuit: 16,
  });
  const [defaultLevel, setDefaultLevel] = useState<LevelKey>('eco');
  const [programs, setPrograms] = useState<BoilerProgram[]>([]);
  const [dayPrograms, setDayPrograms] = useState<DayPrograms>({});
  const [minOnMinutes, setMinOnMinutes] = useState(10);
  const [minOffMinutes, setMinOffMinutes] = useState(5);
  const [boostMinutes, setBoostMinutes] = useState(60);
  const [boostLevel, setBoostLevel] = useState<LevelKey>('confort');

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const { data: levelLabels } = useQuery<Record<LevelKey, string>>({
    queryKey: ['boiler-levels'],
    queryFn: () => api.get('/boiler/levels').then((r) => r.data),
    staleTime: Infinity,
  });

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
      setTemperatureSensorId(config.temperatureSensorId);
      setHysteresis(config.hysteresis);
      setLevels(config.levels);
      setDefaultLevel(config.defaultLevel);
      setPrograms(config.programs);
      setDayPrograms(config.dayPrograms);
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
    mutationFn: () => api.post('/boiler/boost', { level: boostLevel, minutes: boostMinutes }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boiler-status'] }),
  });

  const clearBoost = useMutation({
    mutationFn: () => api.delete('/boiler/boost').then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boiler-status'] }),
  });

  const handleSaveConfig = () => {
    saveConfig.mutate({
      deviceId,
      temperatureSensorId,
      hysteresis,
      levels,
      defaultLevel,
      programs,
      dayPrograms,
      minOnMinutes,
      minOffMinutes,
    });
  };

  const addProgram = () => {
    const id = crypto.randomUUID();
    setPrograms((prev) => [...prev, { id, name: `Programme ${prev.length + 1}`, slots: [] }]);
  };

  const updateProgram = (id: string, patch: Partial<BoilerProgram>) => {
    setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removeProgram = (id: string) => {
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    setDayPrograms((prev) => {
      const next = { ...prev };
      for (const day of Object.keys(next)) {
        if (next[Number(day)] === id) next[Number(day)] = null;
      }
      return next;
    });
  };

  const addSlot = (programId: string) => {
    updateProgram(programId, {
      slots: [
        ...(programs.find((p) => p.id === programId)?.slots ?? []),
        { from: '06:00', to: '22:00', level: defaultLevel },
      ],
    });
  };

  const updateSlot = (programId: string, index: number, patch: Partial<ProgramSlot>) => {
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    const slots = program.slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateProgram(programId, { slots });
  };

  const removeSlot = (programId: string, index: number) => {
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    updateProgram(programId, { slots: program.slots.filter((_, i) => i !== index) });
  };

  const setDayProgram = (day: number, programId: string | null) => {
    setDayPrograms((prev) => ({ ...prev, [day]: programId }));
  };

  const deviceOptions = (devices ?? [])
    .filter((d) => d.type === 'switch' || d.type === 'plug')
    .map((d) => ({ value: d.id, label: d.room ? `${d.name} (${d.room})` : d.name }));

  const sensorOptions = (devices ?? [])
    .filter((d) => d.type === 'sensor_temperature')
    .map((d) => ({ value: d.id, label: d.room ? `${d.name} (${d.room})` : d.name }));

  const levelSelectOptions = LEVEL_ORDER.map((key) => ({
    value: key,
    label: levelLabels?.[key] ?? key,
  }));

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
              Appareils
            </Text>
            <Group grow align="flex-start">
              <Select
                label="Relais chaudière"
                placeholder="Choisir le relais Shelly (Zigbee)"
                data={deviceOptions}
                value={deviceId}
                onChange={setDeviceId}
                searchable
                clearable
              />
              <Select
                label="Sonde de température"
                placeholder="Choisir la sonde de référence"
                data={sensorOptions}
                value={temperatureSensorId}
                onChange={setTemperatureSensorId}
                searchable
                clearable
                leftSection={<IconTemperature size={16} />}
              />
            </Group>
            {!deviceId && (
              <Text size="xs" c="dimmed" mt={4}>
                Appaire le module Shelly S4SW en mode Zigbee via Zigbee2MQTT, puis sélectionne-le ici.
              </Text>
            )}
            {!temperatureSensorId && (
              <Text size="xs" c="dimmed" mt={4}>
                Sans sonde associée, la régulation reste en pause (le relais garde son dernier état).
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
                  <Text size="sm">Niveau actif</Text>
                  <Badge color={LEVEL_COLORS[status.activeLevel]} variant="light">
                    {levelLabels?.[status.activeLevel] ?? status.activeLevel} — cible {status.targetTemp}°C
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Température mesurée</Text>
                  <Text size="sm" c="dimmed">
                    {status.currentTemp !== null ? `${status.currentTemp}°C` : 'indisponible'}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Mode</Text>
                  <Badge color={status.override ? 'orange' : 'blue'} variant="light">
                    {status.override ? 'dérogation manuelle' : 'planning'}
                  </Badge>
                </Group>
                {status.override && (
                  <Text size="xs" c="dimmed">
                    Forcé sur {levelLabels?.[status.override.level] ?? status.override.level} jusqu'à{' '}
                    {new Date(status.override.until).toLocaleString('fr-FR')}
                  </Text>
                )}
                {status.lastChangeAt && (
                  <Text size="xs" c="dimmed">
                    Dernier changement : {new Date(status.lastChangeAt).toLocaleString('fr-FR')}
                  </Text>
                )}

                <Group mt="xs" align="flex-end">
                  <Select
                    label="Niveau"
                    w={140}
                    data={levelSelectOptions}
                    value={boostLevel}
                    onChange={(v) => setBoostLevel((v as LevelKey) ?? 'confort')}
                    allowDeselect={false}
                  />
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
                    color="orange"
                    variant="light"
                    loading={boost.isPending}
                    onClick={() => boost.mutate()}
                  >
                    Forcer ce niveau
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
            <Text size="sm" c="dimmed" mb="sm">
              Niveaux de chauffe
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="md">
              {LEVEL_ORDER.map((key) => (
                <NumberInput
                  key={key}
                  label={levelLabels?.[key] ?? key}
                  suffix="°C"
                  min={5}
                  max={30}
                  step={0.5}
                  value={levels[key]}
                  onChange={(v) =>
                    setLevels((prev) => ({ ...prev, [key]: typeof v === 'number' ? v : prev[key] }))
                  }
                />
              ))}
            </SimpleGrid>
            <Group mt="md">
              <Select
                label="Niveau par défaut (hors planning)"
                w={220}
                data={levelSelectOptions}
                value={defaultLevel}
                onChange={(v) => setDefaultLevel((v as LevelKey) ?? 'eco')}
                allowDeselect={false}
              />
              <NumberInput
                label="Hystérésis (°C)"
                description="Zone morte autour de la cible avant de changer d'état"
                w={160}
                min={0}
                max={5}
                step={0.1}
                value={hysteresis}
                onChange={(v) => setHysteresis(typeof v === 'number' ? v : 0.3)}
              />
            </Group>
          </Card>

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
            <Group justify="space-between" mb="sm">
              <Text size="sm" c="dimmed">
                Programmes (créneaux horaires réutilisables)
              </Text>
              <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={addProgram}>
                Nouveau programme
              </Button>
            </Group>
            {programs.length === 0 ? (
              <Text size="sm" c="dimmed">
                Aucun programme. Crée par exemple "Semaine" et "Week-end", chacun avec ses créneaux, puis
                affecte-les aux jours ci-dessous.
              </Text>
            ) : (
              <Stack gap="md">
                {programs.map((program) => (
                  <Card key={program.id} padding="md" withBorder radius="md" bg="var(--mantine-color-default-hover)">
                    <Group justify="space-between" mb="xs">
                      <TextInput
                        size="sm"
                        value={program.name}
                        onChange={(e) => updateProgram(program.id, { name: e.currentTarget.value })}
                        style={{ flex: 1, maxWidth: 240 }}
                      />
                      <ActionIcon variant="subtle" color="red" onClick={() => removeProgram(program.id)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                    <Stack gap={6}>
                      {program.slots.map((slot, index) => (
                        <Group key={index} gap="xs">
                          <TextInput
                            size="xs"
                            w={80}
                            value={slot.from}
                            onChange={(e) => updateSlot(program.id, index, { from: e.currentTarget.value })}
                            placeholder="06:00"
                          />
                          <Text size="xs" c="dimmed">
                            à
                          </Text>
                          <TextInput
                            size="xs"
                            w={80}
                            value={slot.to}
                            onChange={(e) => updateSlot(program.id, index, { to: e.currentTarget.value })}
                            placeholder="08:00"
                          />
                          <Select
                            size="xs"
                            w={130}
                            data={levelSelectOptions}
                            value={slot.level}
                            onChange={(v) =>
                              updateSlot(program.id, index, { level: (v as LevelKey) ?? defaultLevel })
                            }
                            allowDeselect={false}
                          />
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => removeSlot(program.id, index)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      ))}
                      <ActionIcon variant="subtle" size="sm" onClick={() => addSlot(program.id)}>
                        <IconPlus size={14} />
                      </ActionIcon>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            )}
          </Card>

          <Card shadow="sm" padding="lg" withBorder>
            <Text size="sm" c="dimmed" mb="sm">
              Affectation des programmes aux jours
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 4, md: 7 }} spacing="md">
              {DAYS.map((label, day) => (
                <Select
                  key={day}
                  label={label}
                  size="sm"
                  placeholder="Niveau par défaut"
                  data={programs.map((p) => ({ value: p.id, label: p.name }))}
                  value={dayPrograms[day] ?? null}
                  onChange={(v) => setDayProgram(day, v)}
                  clearable
                />
              ))}
            </SimpleGrid>
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
