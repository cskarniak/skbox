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
  Switch,
  Table,
  ActionIcon,
  Modal,
  TextInput,
  Select,
  MultiSelect,
  NumberInput,
  Popover,
  Card,
  Accordion,
  SegmentedControl,
  SimpleGrid,
} from '@mantine/core';
import { IconSmartHome, IconBulb, IconPlus, IconTrash, IconSun, IconSunset } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';

type TimeOrSolar =
  | { mode: 'fixed'; time: string }
  | { mode: 'solar'; reference: 'sunrise' | 'sunset'; offsetMinutes: number };

interface PresenceSimulation {
  id: string;
  name: string;
  enabled: boolean;
  lightDeviceIds: string[];
  onTime: TimeOrSolar;
  offTime: TimeOrSolar;
  onRandomOffsetMin: number;
  onRandomOffsetMax: number;
  offRandomOffsetMin: number;
  offRandomOffsetMax: number;
  toggleCountMin: number;
  toggleCountMax: number;
  toggleDurationMin: number;
  toggleDurationMax: number;
  toggleWindowMinutes: number;
}

interface PresenceEvent {
  id: string;
  kind: string;
  action: string;
  scheduledAt: string;
  executedAt: string | null;
  success: boolean | null;
  error: string | null;
}

interface PresenceRun {
  id: string;
  date: string;
  plannedOnAt: string;
  plannedOffAt: string;
  verifiedAt: string | null;
  verifiedOk: boolean | null;
  events: PresenceEvent[];
}

interface Device {
  id: string;
  name: string;
  type: string;
}

interface SunTimes {
  sunrise: string;
  sunset: string;
  date: string;
}

function timeOrSolarLabel(t: TimeOrSolar): string {
  if (t.mode === 'fixed') return t.time;
  const label = t.reference === 'sunrise' ? 'Lever du soleil' : 'Coucher du soleil';
  const offset = t.offsetMinutes ? ` ${t.offsetMinutes > 0 ? '+' : ''}${t.offsetMinutes}min` : '';
  return `${label}${offset}`;
}

function TimeOrSolarField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TimeOrSolar;
  onChange: (v: TimeOrSolar) => void;
}) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>{label}</Text>
      <SegmentedControl
        size="xs"
        data={[
          { value: 'fixed', label: 'Heure fixe' },
          { value: 'solar', label: 'Soleil' },
        ]}
        value={value.mode}
        onChange={(v) =>
          onChange(
            v === 'solar'
              ? { mode: 'solar', reference: 'sunset', offsetMinutes: 0 }
              : { mode: 'fixed', time: '19:00' },
          )
        }
      />
      {value.mode === 'fixed' ? (
        <TextInput
          placeholder="19:00"
          value={value.time}
          onChange={(e) => onChange({ mode: 'fixed', time: e.currentTarget.value })}
        />
      ) : (
        <Group grow>
          <Select
            data={[
              { value: 'sunrise', label: 'Lever du soleil' },
              { value: 'sunset', label: 'Coucher du soleil' },
            ]}
            value={value.reference}
            onChange={(v) =>
              onChange({ mode: 'solar', reference: (v as 'sunrise' | 'sunset') ?? 'sunset', offsetMinutes: value.offsetMinutes })
            }
          />
          <NumberInput
            placeholder="Décalage (min)"
            value={value.offsetMinutes}
            onChange={(v) => onChange({ mode: 'solar', reference: value.reference, offsetMinutes: Number(v) || 0 })}
            min={-180}
            max={180}
          />
        </Group>
      )}
    </Stack>
  );
}

function PresenceSimulationForm({
  opened,
  onClose,
  profile,
}: {
  opened: boolean;
  onClose: () => void;
  profile?: PresenceSimulation;
}) {
  const queryClient = useQueryClient();
  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const [name, setName] = useState(profile?.name ?? '');
  const [lightDeviceIds, setLightDeviceIds] = useState<string[]>(profile?.lightDeviceIds ?? []);
  const [onTime, setOnTime] = useState<TimeOrSolar>(profile?.onTime ?? { mode: 'fixed', time: '19:00' });
  const [offTime, setOffTime] = useState<TimeOrSolar>(profile?.offTime ?? { mode: 'fixed', time: '23:00' });
  const [onRandomOffsetMin, setOnRandomOffsetMin] = useState(profile?.onRandomOffsetMin ?? 0);
  const [onRandomOffsetMax, setOnRandomOffsetMax] = useState(profile?.onRandomOffsetMax ?? 0);
  const [offRandomOffsetMin, setOffRandomOffsetMin] = useState(profile?.offRandomOffsetMin ?? 0);
  const [offRandomOffsetMax, setOffRandomOffsetMax] = useState(profile?.offRandomOffsetMax ?? 0);
  const [toggleCountMin, setToggleCountMin] = useState(profile?.toggleCountMin ?? 2);
  const [toggleCountMax, setToggleCountMax] = useState(profile?.toggleCountMax ?? 5);
  const [toggleDurationMin, setToggleDurationMin] = useState(profile?.toggleDurationMin ?? 5);
  const [toggleDurationMax, setToggleDurationMax] = useState(profile?.toggleDurationMax ?? 30);
  const [toggleWindowMinutes, setToggleWindowMinutes] = useState(profile?.toggleWindowMinutes ?? 60);

  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      profile ? api.patch(`/presence-simulation/${profile.id}`, data) : api.post('/presence-simulation', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presence-simulation'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    save.mutate({
      name,
      enabled: profile?.enabled ?? true,
      lightDeviceIds,
      onTime,
      offTime,
      onRandomOffsetMin,
      onRandomOffsetMax,
      offRandomOffsetMin,
      offRandomOffsetMax,
      toggleCountMin,
      toggleCountMax,
      toggleDurationMin,
      toggleDurationMax,
      toggleWindowMinutes,
    });
  };

  const deviceOptions = (devices ?? []).map((d) => ({ value: d.id, label: d.name }));
  const valid = name.trim().length > 0 && lightDeviceIds.length > 0 && toggleCountMin <= toggleCountMax && toggleDurationMin <= toggleDurationMax;

  return (
    <Modal opened={opened} onClose={onClose} title={profile ? 'Modifier la simulation' : 'Nouvelle simulation de présence'} size="lg">
      <Stack gap="md">
        <TextInput
          label="Nom"
          placeholder="Ex: Salon"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <MultiSelect
          label="Lampes"
          placeholder="Sélectionner une ou plusieurs lampes"
          data={deviceOptions}
          value={lightDeviceIds}
          onChange={setLightDeviceIds}
          searchable
          required
        />

        <TimeOrSolarField label="Allumage" value={onTime} onChange={setOnTime} />
        <Group grow>
          <NumberInput
            label="Décalage aléatoire min (min)"
            value={onRandomOffsetMin}
            onChange={(v) => setOnRandomOffsetMin(Number(v) || 0)}
            min={0}
            max={180}
          />
          <NumberInput
            label="Décalage aléatoire max (min)"
            value={onRandomOffsetMax}
            onChange={(v) => setOnRandomOffsetMax(Number(v) || 0)}
            min={0}
            max={180}
          />
        </Group>

        <TimeOrSolarField label="Extinction" value={offTime} onChange={setOffTime} />
        <Group grow>
          <NumberInput
            label="Décalage aléatoire min (min)"
            value={offRandomOffsetMin}
            onChange={(v) => setOffRandomOffsetMin(Number(v) || 0)}
            min={0}
            max={180}
          />
          <NumberInput
            label="Décalage aléatoire max (min)"
            value={offRandomOffsetMax}
            onChange={(v) => setOffRandomOffsetMax(Number(v) || 0)}
            min={0}
            max={180}
          />
        </Group>

        <Title order={5}>Bascules aléatoires avant l&apos;extinction</Title>
        <NumberInput
          label="Fenêtre de bascules avant l'extinction (min)"
          description="Le début de soirée reste stable (allumé) ; les bascules aléatoires ne se produisent que dans ces X dernières minutes avant l'extinction, comme lors du coucher."
          value={toggleWindowMinutes}
          onChange={(v) => setToggleWindowMinutes(Number(v) || 0)}
          min={0}
          max={600}
        />
        <Group grow>
          <NumberInput
            label="Nombre de bascules min"
            value={toggleCountMin}
            onChange={(v) => setToggleCountMin(Number(v) || 0)}
            min={0}
            max={50}
          />
          <NumberInput
            label="Nombre de bascules max"
            value={toggleCountMax}
            onChange={(v) => setToggleCountMax(Number(v) || 0)}
            min={0}
            max={50}
          />
        </Group>
        <Group grow>
          <NumberInput
            label="Durée min (min)"
            value={toggleDurationMin}
            onChange={(v) => setToggleDurationMin(Number(v) || 1)}
            min={1}
            max={600}
          />
          <NumberInput
            label="Durée max (min)"
            value={toggleDurationMax}
            onChange={(v) => setToggleDurationMax(Number(v) || 1)}
            min={1}
            max={600}
          />
        </Group>
        <Text size="xs" c="dimmed">
          À chaque bascule, une durée est tirée au hasard dans cette fourchette pour l&apos;état temporaire (extinction puis rallumage).
        </Text>

        <Button onClick={handleSubmit} loading={save.isPending} disabled={!valid}>
          {profile ? 'Enregistrer' : 'Créer'}
        </Button>
      </Stack>
    </Modal>
  );
}

function DeleteConfirm({ onConfirm }: { onConfirm: () => void }) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} withArrow shadow="md">
      <Popover.Target>
        <ActionIcon variant="subtle" color="red" onClick={() => setOpened(true)} title="Supprimer">
          <IconTrash size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={500}>Supprimer cette simulation ?</Text>
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="default" onClick={() => setOpened(false)}>Non</Button>
            <Button
              size="xs"
              color="red"
              onClick={() => {
                onConfirm();
                setOpened(false);
              }}
            >
              Oui
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function EventStatusBadge({ event }: { event: PresenceEvent }) {
  if (event.success === null) return <Badge size="xs" variant="outline" color="gray">En attente</Badge>;
  if (event.success) return <Badge size="xs" variant="light" color="green">OK</Badge>;
  return <Badge size="xs" variant="light" color="red" title={event.error ?? undefined}>Échec</Badge>;
}

const KIND_LABELS: Record<string, string> = {
  on: 'Allumage',
  off: 'Extinction',
  toggle_on: 'Rallumage (bascule)',
  toggle_off: 'Extinction (bascule)',
};

function EventLog({ profileId }: { profileId: string }) {
  const { data: runs, isLoading } = useQuery<PresenceRun[]>({
    queryKey: ['presence-simulation', profileId, 'events'],
    queryFn: () => api.get(`/presence-simulation/${profileId}/events`).then((r) => r.data),
  });

  if (isLoading) return <Center h={100}><Loader size="sm" /></Center>;
  if (!runs?.length) return <Text size="sm" c="dimmed">Aucun événement pour l&apos;instant.</Text>;

  return (
    <Accordion multiple defaultValue={[runs[0]?.id].filter(Boolean)}>
      {runs.map((run) => (
        <Accordion.Item key={run.id} value={run.id}>
          <Accordion.Control>
            <Group gap="xs">
              <Text fw={500}>{run.date}</Text>
              {run.verifiedAt ? (
                <Badge size="sm" variant="light" color={run.verifiedOk ? 'green' : 'red'}>
                  {run.verifiedOk ? 'Vérifié OK' : 'Vérifié — échec'}
                </Badge>
              ) : (
                <Badge size="sm" variant="outline" color="gray">Pas encore vérifié</Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Événement</Table.Th>
                  <Table.Th>Prévu</Table.Th>
                  <Table.Th>Exécuté</Table.Th>
                  <Table.Th>Statut</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {run.events.map((e) => (
                  <Table.Tr key={e.id}>
                    <Table.Td>{KIND_LABELS[e.kind] ?? e.kind}</Table.Td>
                    <Table.Td>{new Date(e.scheduledAt).toLocaleTimeString('fr-FR')}</Table.Td>
                    <Table.Td>{e.executedAt ? new Date(e.executedAt).toLocaleTimeString('fr-FR') : '—'}</Table.Td>
                    <Table.Td><EventStatusBadge event={e} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function ProfileCard({
  profile,
  devices,
  onEdit,
  onToggleEnabled,
  onDelete,
}: {
  profile: PresenceSimulation;
  devices: Device[];
  onEdit: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const lightNames = profile.lightDeviceIds
    .map((id) => devices.find((d) => d.id === id)?.name ?? id)
    .join(', ');

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ cursor: 'pointer', flex: 1 }} onClick={onEdit}>
          <IconBulb size={22} />
          <div>
            <Text fw={500}>{profile.name}</Text>
            <Text size="xs" c="dimmed">{lightNames || 'Aucune lampe'}</Text>
          </div>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Switch checked={profile.enabled} onChange={(e) => onToggleEnabled(e.currentTarget.checked)} />
          <DeleteConfirm onConfirm={onDelete} />
        </Group>
      </Group>
      <Stack gap={4} mb="sm">
        <Text size="sm">Allumage : {timeOrSolarLabel(profile.onTime)}</Text>
        <Text size="sm">Extinction : {timeOrSolarLabel(profile.offTime)}</Text>
        <Text size="xs" c="dimmed">
          {profile.toggleCountMin}–{profile.toggleCountMax} bascule(s) aléatoire(s), {profile.toggleDurationMin}–{profile.toggleDurationMax} min chacune,
          dans les {profile.toggleWindowMinutes} min avant l&apos;extinction
        </Text>
      </Stack>
      <Button size="xs" variant="light" onClick={() => setShowLog((v) => !v)}>
        {showLog ? 'Masquer le journal' : 'Voir le journal des événements'}
      </Button>
      {showLog && (
        <Stack mt="sm">
          <EventLog profileId={profile.id} />
        </Stack>
      )}
    </Card>
  );
}

function SunTimesCard() {
  const { data: sun } = useQuery<SunTimes | null>({
    queryKey: ['weather-sun'],
    queryFn: () => api.get('/weather/home/sun').then((r) => r.data),
    retry: false,
  });

  if (!sun) return null;

  return (
    <Card shadow="sm" padding="md" withBorder>
      <Group gap="lg">
        <Group gap={6}>
          <IconSun size={18} />
          <Text size="sm">Lever : {new Date(sun.sunrise).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
        </Group>
        <Group gap={6}>
          <IconSunset size={18} />
          <Text size="sm">Coucher : {new Date(sun.sunset).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
        </Group>
      </Group>
    </Card>
  );
}

export default function PresenceSimulationPage() {
  const queryClient = useQueryClient();
  const [formOpened, setFormOpened] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PresenceSimulation | undefined>();

  const { data: profiles, isLoading } = useQuery<PresenceSimulation[]>({
    queryKey: ['presence-simulation'],
    queryFn: () => api.get('/presence-simulation').then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put(`/presence-simulation/${id}/enabled`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presence-simulation'] }),
  });

  const deleteProfile = useMutation({
    mutationFn: (id: string) => api.delete(`/presence-simulation/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presence-simulation'] }),
  });

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
          <Group justify="space-between">
            <Title order={4}>Simulation de présence</Title>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                setEditingProfile(undefined);
                setFormOpened(true);
              }}
            >
              Nouvelle simulation
            </Button>
          </Group>

          <SunTimesCard />

          {isLoading ? (
            <Center h={200}>
              <Loader />
            </Center>
          ) : !profiles?.length ? (
            <Center h={200}>
              <Stack align="center" gap="xs">
                <IconBulb size={48} opacity={0.5} />
                <Text c="dimmed">Aucune simulation configurée</Text>
              </Stack>
            </Center>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  devices={devices ?? []}
                  onEdit={() => {
                    setEditingProfile(p);
                    setFormOpened(true);
                  }}
                  onToggleEnabled={(enabled) => toggleEnabled.mutate({ id: p.id, enabled })}
                  onDelete={() => deleteProfile.mutate(p.id)}
                />
              ))}
            </SimpleGrid>
          )}
        </Stack>

        <PresenceSimulationForm
          key={editingProfile?.id ?? 'new'}
          opened={formOpened}
          onClose={() => setFormOpened(false)}
          profile={editingProfile}
        />
      </AppShell.Main>
    </AppShell>
  );
}
