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
  Textarea,
  Select,
  JsonInput,
  Popover,
  Card,
  Alert,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconPlus,
  IconTrash,
  IconDeviceDesktop,
  IconBrandTelegram,
  IconMail,
  IconCheck,
} from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';

const operatorOptions = [
  { value: 'eq', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
];

function operatorSymbol(op?: string) {
  return operatorOptions.find((o) => o.value === op)?.label ?? '=';
}

function parseValue(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}

interface Trigger {
  type: string;
  deviceId?: string;
  property?: string;
  operator?: string;
  value?: unknown;
}

type Action =
  | { type: 'device_command'; deviceId: string; command: Record<string, unknown> }
  | { type: 'notify_telegram'; message: string }
  | { type: 'notify_email'; subject: string; message: string };

interface AlarmScenario {
  id: string;
  name: string;
  enabled: boolean;
  category: string;
  severity: 'critical' | 'warning' | null;
  trigger: Trigger;
  actions: Action[];
  createdAt: string;
}

interface AlarmEvent {
  id: string;
  scenarioId: string;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  scenario: AlarmScenario;
}

interface Device {
  id: string;
  name: string;
  room?: string | null;
}

function severityColor(severity?: string | null) {
  return severity === 'critical' ? 'red' : 'orange';
}

function ActionRow({
  action,
  devices,
  onChange,
  onRemove,
}: {
  action: Action;
  devices: Device[];
  onChange: (action: Action) => void;
  onRemove: () => void;
}) {
  const deviceOptions = devices.map((d) => ({ value: d.id, label: d.name }));

  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" mb="xs">
        <Select
          label="Type d'action"
          data={[
            { value: 'notify_telegram', label: 'Notifier par Telegram' },
            { value: 'notify_email', label: 'Notifier par email' },
            { value: 'device_command', label: 'Commander un appareil' },
          ]}
          value={action.type}
          onChange={(v) => {
            if (v === 'notify_telegram') onChange({ type: 'notify_telegram', message: '' });
            else if (v === 'notify_email') onChange({ type: 'notify_email', subject: '', message: '' });
            else if (v === 'device_command') onChange({ type: 'device_command', deviceId: '', command: { state: 'ON' } });
          }}
          style={{ flex: 1 }}
        />
        <ActionIcon variant="subtle" color="red" mt={22} onClick={onRemove} title="Supprimer l'action">
          <IconTrash size={16} />
        </ActionIcon>
      </Group>

      {action.type === 'notify_telegram' && (
        <Textarea
          label="Message"
          placeholder="Ex: Fuite d'eau détectée !"
          value={action.message}
          onChange={(e) => onChange({ ...action, message: e.currentTarget.value })}
          autosize
          minRows={2}
        />
      )}

      {action.type === 'notify_email' && (
        <Stack gap="xs">
          <TextInput
            label="Sujet"
            placeholder="Ex: Alarme Skbox"
            value={action.subject}
            onChange={(e) => onChange({ ...action, subject: e.currentTarget.value })}
          />
          <Textarea
            label="Message"
            value={action.message}
            onChange={(e) => onChange({ ...action, message: e.currentTarget.value })}
            autosize
            minRows={2}
          />
        </Stack>
      )}

      {action.type === 'device_command' && (
        <Stack gap="xs">
          <Select
            label="Appareil"
            placeholder="Sélectionner un appareil"
            data={deviceOptions}
            value={action.deviceId}
            onChange={(v) => onChange({ ...action, deviceId: v ?? '' })}
            searchable
          />
          <JsonInput
            label="Commande (JSON)"
            value={JSON.stringify(action.command)}
            onChange={(v) => {
              try {
                onChange({ ...action, command: JSON.parse(v) });
              } catch {
                // ignore invalid JSON while typing
              }
            }}
            minRows={2}
            formatOnBlur
            validationError="JSON invalide"
          />
        </Stack>
      )}
    </Card>
  );
}

function AlarmForm({
  opened,
  onClose,
  scenario,
}: {
  opened: boolean;
  onClose: () => void;
  scenario?: AlarmScenario;
}) {
  const queryClient = useQueryClient();
  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const [name, setName] = useState(scenario?.name ?? '');
  const [severity, setSeverity] = useState<string>(scenario?.severity ?? 'critical');
  const [deviceId, setDeviceId] = useState(scenario?.trigger?.deviceId ?? '');
  const [property, setProperty] = useState(scenario?.trigger?.property ?? '');
  const [operator, setOperator] = useState(scenario?.trigger?.operator ?? 'eq');
  const [value, setValue] = useState(
    scenario?.trigger?.value !== undefined ? String(scenario.trigger.value) : '',
  );
  const [actions, setActions] = useState<Action[]>(
    scenario?.actions ?? [{ type: 'notify_telegram', message: '' }],
  );

  const updateAction = (index: number, action: Action) => {
    setActions((prev) => prev.map((a, i) => (i === index ? action : a)));
  };
  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };
  const addAction = () => {
    setActions((prev) => [...prev, { type: 'notify_telegram', message: '' }]);
  };

  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      scenario ? api.patch(`/scenarios/${scenario.id}`, data) : api.post('/scenarios', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!actions.length) return;
    save.mutate({
      name,
      enabled: scenario?.enabled ?? true,
      category: 'alarm',
      severity,
      trigger: {
        type: 'device_state',
        deviceId,
        property,
        operator,
        value: parseValue(value),
      },
      conditions: [],
      actions,
    });
  };

  const deviceOptions = (devices ?? []).map((d) => ({ value: d.id, label: d.name }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={scenario ? "Modifier l'alarme" : 'Nouvelle alarme'}
      size="lg"
    >
      <Stack gap="md">
        <TextInput
          label="Nom"
          placeholder="Ex: Fuite d'eau cuisine"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />

        <Select
          label="Sévérité"
          data={[
            { value: 'critical', label: 'Critique' },
            { value: 'warning', label: 'Avertissement' },
          ]}
          value={severity}
          onChange={(v) => setSeverity(v ?? 'critical')}
        />

        <Title order={5}>Capteur surveillé</Title>
        <Select
          label="Appareil"
          placeholder="Sélectionner un appareil"
          data={deviceOptions}
          value={deviceId}
          onChange={(v) => setDeviceId(v ?? '')}
          searchable
        />
        <Group grow>
          <TextInput
            label="Propriété"
            placeholder="Ex: water_leak, smoke"
            value={property}
            onChange={(e) => setProperty(e.currentTarget.value)}
          />
          <Select
            label="Opérateur"
            data={operatorOptions}
            value={operator}
            onChange={(v) => setOperator(v ?? 'eq')}
          />
          <TextInput
            label="Valeur d'alerte"
            placeholder="Ex: true"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
          />
        </Group>
        <Text size="xs" c="dimmed">
          L&apos;alarme se déclenche quand cette condition devient vraie, et se résout
          automatiquement quand le capteur revient à la normale.
        </Text>

        <Title order={5}>Actions au déclenchement</Title>
        {actions.map((a, i) => (
          <ActionRow
            key={i}
            action={a}
            devices={devices ?? []}
            onChange={(action) => updateAction(i, action)}
            onRemove={() => removeAction(i)}
          />
        ))}
        <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={addAction}>
          Ajouter une action
        </Button>

        <Button onClick={handleSubmit} loading={save.isPending} disabled={!deviceId || !property || !actions.length}>
          {scenario ? 'Enregistrer' : 'Créer'}
        </Button>
      </Stack>
    </Modal>
  );
}

function DeleteAlarmButton({ onConfirm }: { onConfirm: () => void }) {
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
          <Text size="sm" fw={500}>Supprimer cette alarme ?</Text>
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

function ActionsSummary({ actions }: { actions: Action[] }) {
  return (
    <Stack gap={2}>
      {actions.map((a, i) => {
        if (a.type === 'notify_telegram') {
          return (
            <Group key={i} gap={4}>
              <IconBrandTelegram size={14} />
              <Text size="xs" c="dimmed">Telegram</Text>
            </Group>
          );
        }
        if (a.type === 'notify_email') {
          return (
            <Group key={i} gap={4}>
              <IconMail size={14} />
              <Text size="xs" c="dimmed">Email</Text>
            </Group>
          );
        }
        return (
          <Group key={i} gap={4}>
            <IconDeviceDesktop size={14} />
            <Text size="xs" c="dimmed">Commande appareil</Text>
          </Group>
        );
      })}
    </Stack>
  );
}

export default function AlarmsPage() {
  const queryClient = useQueryClient();
  const [formOpened, setFormOpened] = useState(false);
  const [editingScenario, setEditingScenario] = useState<AlarmScenario | undefined>();

  const { data: scenarios, isLoading } = useQuery<AlarmScenario[]>({
    queryKey: ['scenarios'],
    queryFn: () => api.get('/scenarios').then((r) => r.data),
    refetchInterval: 10000,
    select: (data) => data.filter((s) => s.category === 'alarm'),
  });

  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const { data: openEvents } = useQuery<AlarmEvent[]>({
    queryKey: ['alarm-events', 'open'],
    queryFn: () => api.get('/scenarios/alarm-events', { params: { resolved: false } }).then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: allEvents } = useQuery<AlarmEvent[]>({
    queryKey: ['alarm-events', 'all'],
    queryFn: () => api.get('/scenarios/alarm-events').then((r) => r.data),
    refetchInterval: 10000,
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/scenarios/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });

  const deleteScenario = useMutation({
    mutationFn: (id: string) => api.delete(`/scenarios/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.post(`/scenarios/alarm-events/${id}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarm-events'] }),
  });

  const roomOf = (deviceId?: string) => devices?.find((d) => d.id === deviceId)?.room;
  const deviceName = (deviceId?: string) => devices?.find((d) => d.id === deviceId)?.name ?? deviceId;

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconAlertTriangle size={28} />
            <Title order={3} visibleFrom="sm">Skbox</Title>
          </Group>
          <Group gap="md" wrap="nowrap">
            <AppNav active="alarms" />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {!!openEvents?.length && (
          <Stack gap="xs" mb="md">
            {openEvents.map((ev) => (
              <Alert
                key={ev.id}
                color={severityColor(ev.scenario.severity)}
                icon={<IconAlertTriangle size={18} />}
                title={ev.scenario.name}
              >
                <Group justify="space-between" align="center">
                  <Text size="sm">
                    Déclenchée le {new Date(ev.triggeredAt).toLocaleString('fr-FR')}
                    {roomOf(ev.scenario.trigger.deviceId) ? ` · ${roomOf(ev.scenario.trigger.deviceId)}` : ''}
                  </Text>
                  <Button
                    size="xs"
                    variant="white"
                    leftSection={<IconCheck size={14} />}
                    loading={acknowledge.isPending}
                    onClick={() => acknowledge.mutate(ev.id)}
                  >
                    Acquitter
                  </Button>
                </Group>
              </Alert>
            ))}
          </Stack>
        )}

        <Group justify="space-between" mb="md">
          <Title order={4}>Alarmes</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setEditingScenario(undefined);
              setFormOpened(true);
            }}
          >
            Nouvelle alarme
          </Button>
        </Group>

        {isLoading ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : !scenarios?.length ? (
          <Center h={200}>
            <Stack align="center" gap="xs">
              <IconAlertTriangle size={48} opacity={0.5} />
              <Text c="dimmed">Aucune alarme configurée</Text>
              <Text c="dimmed" size="sm">
                Surveillez un capteur (eau, fumée...) et soyez notifié en cas de déclenchement
              </Text>
            </Stack>
          </Center>
        ) : (
          <Table striped highlightOnHover mb="xl">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Actif</Table.Th>
                <Table.Th>Nom</Table.Th>
                <Table.Th>Sévérité</Table.Th>
                <Table.Th>Capteur</Table.Th>
                <Table.Th>Actions</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {scenarios.map((s) => (
                <Table.Tr
                  key={s.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setEditingScenario(s);
                    setFormOpened(true);
                  }}
                >
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={s.enabled}
                      onChange={(e) => toggleEnabled.mutate({ id: s.id, enabled: e.currentTarget.checked })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500}>{s.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={severityColor(s.severity)} variant="light">
                      {s.severity === 'critical' ? 'Critique' : 'Avertissement'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <IconDeviceDesktop size={14} />
                      <Text size="sm">
                        {deviceName(s.trigger.deviceId)} · {s.trigger.property}{' '}
                        {operatorSymbol(s.trigger.operator)} {String(s.trigger.value)}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <ActionsSummary actions={s.actions} />
                  </Table.Td>
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <DeleteAlarmButton onConfirm={() => deleteScenario.mutate(s.id)} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Title order={5} mb="sm">Historique</Title>
        {!allEvents?.length ? (
          <Text c="dimmed" size="sm">Aucun déclenchement enregistré</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Alarme</Table.Th>
                <Table.Th>Déclenchée</Table.Th>
                <Table.Th>Résolue</Table.Th>
                <Table.Th>Acquittée</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {allEvents.map((ev) => (
                <Table.Tr key={ev.id}>
                  <Table.Td>{ev.scenario.name}</Table.Td>
                  <Table.Td>{new Date(ev.triggeredAt).toLocaleString('fr-FR')}</Table.Td>
                  <Table.Td>{ev.resolvedAt ? new Date(ev.resolvedAt).toLocaleString('fr-FR') : '—'}</Table.Td>
                  <Table.Td>{ev.acknowledgedAt ? new Date(ev.acknowledgedAt).toLocaleString('fr-FR') : '—'}</Table.Td>
                  <Table.Td>
                    {!ev.acknowledgedAt && (
                      <Button size="xs" variant="light" onClick={() => acknowledge.mutate(ev.id)} loading={acknowledge.isPending}>
                        Acquitter
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <AlarmForm
          key={editingScenario?.id ?? 'new'}
          opened={formOpened}
          onClose={() => setFormOpened(false)}
          scenario={editingScenario}
        />
      </AppShell.Main>
    </AppShell>
  );
}
