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
  Tabs,
  Tooltip,
  Table,
  ActionIcon,
  Modal,
  TextInput,
  Select,
  JsonInput,
  NumberInput,
  Popover,
  Card,
} from '@mantine/core';
import {
  IconSmartHome,
  IconScript,
  IconPlus,
  IconTrash,
  IconPlayerPlay,
  IconNetwork,
  IconClock,
  IconDeviceDesktop,
} from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

interface Trigger {
  type: string;
  deviceId?: string;
  property?: string;
  operator?: string;
  value?: unknown;
  cron?: string;
  randomDelayMin?: number;
  randomDelayMax?: number;
}

interface Condition {
  type: string;
  from?: string;
  to?: string;
  deviceId?: string;
  property?: string;
  operator?: string;
  value?: unknown;
  deviceIdA?: string;
  propertyA?: string;
  deviceIdB?: string;
  propertyB?: string;
  threshold?: number;
}

const operatorOptions = [
  { value: 'eq', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
];

const diffOperatorOptions = operatorOptions.filter((o) => o.value !== 'eq');

function operatorSymbol(op?: string) {
  return operatorOptions.find((o) => o.value === op)?.label ?? '=';
}

function parseValue(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}

interface Action {
  type: string;
  deviceId?: string;
  command?: Record<string, unknown>;
}

interface Scenario {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
  createdAt: string;
}

interface Device {
  id: string;
  name: string;
  type: string;
}

function ScenarioForm({
  opened,
  onClose,
  scenario,
}: {
  opened: boolean;
  onClose: () => void;
  scenario?: Scenario;
}) {
  const queryClient = useQueryClient();
  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const [name, setName] = useState(scenario?.name ?? '');
  const [triggerType, setTriggerType] = useState<string>(
    scenario?.trigger?.type ?? 'device_state',
  );
  const [triggerDeviceId, setTriggerDeviceId] = useState(
    scenario?.trigger?.deviceId ?? '',
  );
  const [triggerProperty, setTriggerProperty] = useState(
    scenario?.trigger?.property ?? '',
  );
  const [triggerOperator, setTriggerOperator] = useState(
    scenario?.trigger?.operator ?? 'eq',
  );
  const [triggerValue, setTriggerValue] = useState(
    scenario?.trigger?.value !== undefined
      ? String(scenario.trigger.value)
      : '',
  );
  const [cronExpression, setCronExpression] = useState(
    scenario?.trigger?.cron ?? '0 19 * * *',
  );
  const [randomDelayMin, setRandomDelayMin] = useState(
    scenario?.trigger?.randomDelayMin ?? 0,
  );
  const [randomDelayMax, setRandomDelayMax] = useState(
    scenario?.trigger?.randomDelayMax ?? 0,
  );
  const [conditions, setConditions] = useState<Condition[]>(
    scenario?.conditions ?? [],
  );

  const updateCondition = (index: number, patch: Partial<Condition>) => {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const addCondition = () => {
    setConditions((prev) => [...prev, { type: 'time_range' }]);
  };

  const [actionDeviceId, setActionDeviceId] = useState(
    scenario?.actions?.[0]?.deviceId ?? '',
  );
  const [actionCommand, setActionCommand] = useState(
    scenario?.actions?.[0]?.command
      ? JSON.stringify(scenario.actions[0].command, null, 2)
      : '{"state": "ON"}',
  );

  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      scenario
        ? api.patch(`/scenarios/${scenario.id}`, data)
        : api.post('/scenarios', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    const validConditions = conditions.filter((c) => {
      if (c.type === 'time_range') return !!c.from && !!c.to;
      if (c.type === 'device_state') return !!c.deviceId && !!c.property;
      if (c.type === 'device_diff')
        return !!c.deviceIdA && !!c.propertyA && !!c.deviceIdB && !!c.propertyB;
      return false;
    }).map((c) => {
      if (c.type === 'time_range') return { type: 'time_range', from: c.from, to: c.to };
      if (c.type === 'device_state')
        return {
          type: 'device_state',
          deviceId: c.deviceId,
          property: c.property,
          operator: c.operator ?? 'eq',
          value: typeof c.value === 'string' ? parseValue(c.value) : c.value,
        };
      return {
        type: 'device_diff',
        deviceIdA: c.deviceIdA,
        propertyA: c.propertyA,
        deviceIdB: c.deviceIdB,
        propertyB: c.propertyB,
        operator: c.operator ?? 'gte',
        threshold: c.threshold ?? 0,
      };
    });

    let parsedCommand: Record<string, unknown>;
    try {
      parsedCommand = JSON.parse(actionCommand);
    } catch {
      return;
    }

    let trigger: Record<string, unknown>;
    if (triggerType === 'cron') {
      trigger = {
        type: 'cron',
        cron: cronExpression,
        randomDelayMin,
        randomDelayMax,
      };
    } else {
      trigger = {
        type: 'device_state',
        deviceId: triggerDeviceId,
        property: triggerProperty,
        operator: triggerOperator,
        value: parseValue(triggerValue),
      };
    }

    save.mutate({
      name,
      enabled: scenario?.enabled ?? true,
      trigger,
      conditions: validConditions,
      actions: [
        {
          type: 'device_command',
          deviceId: actionDeviceId,
          command: parsedCommand,
        },
      ],
    });
  };

  const deviceOptions = (devices ?? []).map((d) => ({
    value: d.id,
    label: d.name,
  }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={scenario ? 'Modifier le scénario' : 'Nouveau scénario'}
      size="lg"
    >
      <Stack gap="md">
        <TextInput
          label="Nom"
          placeholder="Ex: Lumière bureau le soir"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />

        <Title order={5}>Déclencheur</Title>
        <Select
          label="Type"
          data={[
            { value: 'device_state', label: 'État d\'un appareil' },
            { value: 'cron', label: 'Planification horaire' },
          ]}
          value={triggerType}
          onChange={(v) => setTriggerType(v ?? 'device_state')}
        />

        {triggerType === 'device_state' && (
          <>
            <Select
              label="Appareil"
              placeholder="Sélectionner un appareil"
              data={deviceOptions}
              value={triggerDeviceId}
              onChange={(v) => setTriggerDeviceId(v ?? '')}
              searchable
            />
            <Group grow>
              <TextInput
                label="Propriété"
                placeholder="Ex: occupancy, state, temperature"
                value={triggerProperty}
                onChange={(e) => setTriggerProperty(e.currentTarget.value)}
              />
              <Select
                label="Opérateur"
                data={operatorOptions}
                value={triggerOperator}
                onChange={(v) => setTriggerOperator(v ?? 'eq')}
              />
              <TextInput
                label="Valeur"
                placeholder="Ex: true, ON, 24"
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.currentTarget.value)}
              />
            </Group>
          </>
        )}

        {triggerType === 'cron' && (
          <>
            <TextInput
              label="Expression cron"
              placeholder="0 19 * * *"
              description="min heure jour mois jour-semaine (ex: 0 19 * * * = tous les jours à 19h)"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.currentTarget.value)}
            />
            <Group grow>
              <NumberInput
                label="Délai aléatoire min (minutes)"
                value={randomDelayMin}
                onChange={(v) => setRandomDelayMin(Number(v) || 0)}
                description="Retard minimum ajouté"
                min={0}
                max={120}
              />
              <NumberInput
                label="Délai aléatoire max (minutes)"
                value={randomDelayMax}
                onChange={(v) => setRandomDelayMax(Number(v) || 0)}
                description="Retard maximum ajouté"
                min={0}
                max={120}
              />
            </Group>
            {randomDelayMax > 0 && (
              <Text size="sm" c="dimmed">
                Exécution entre {randomDelayMin} et {randomDelayMax} min après l&apos;heure programmée
              </Text>
            )}
          </>
        )}

        <Title order={5}>Conditions (optionnel)</Title>
        {conditions.map((c, i) => (
          <Card key={i} withBorder padding="sm">
            <Group justify="space-between" mb="xs">
              <Select
                label="Type"
                data={[
                  { value: 'time_range', label: 'Plage horaire' },
                  { value: 'device_state', label: "État d'un appareil" },
                  { value: 'device_diff', label: 'Comparaison entre 2 appareils' },
                ]}
                value={c.type}
                onChange={(v) => updateCondition(i, { type: v ?? 'time_range' })}
                style={{ flex: 1 }}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                mt={22}
                onClick={() => removeCondition(i)}
                title="Supprimer la condition"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>

            {c.type === 'time_range' && (
              <Group grow>
                <TextInput
                  label="De (HH:MM)"
                  placeholder="18:00"
                  value={c.from ?? ''}
                  onChange={(e) => updateCondition(i, { from: e.currentTarget.value })}
                />
                <TextInput
                  label="À (HH:MM)"
                  placeholder="23:00"
                  value={c.to ?? ''}
                  onChange={(e) => updateCondition(i, { to: e.currentTarget.value })}
                />
              </Group>
            )}

            {c.type === 'device_state' && (
              <Stack gap="xs">
                <Select
                  label="Appareil"
                  placeholder="Sélectionner un appareil"
                  data={deviceOptions}
                  value={c.deviceId ?? ''}
                  onChange={(v) => updateCondition(i, { deviceId: v ?? '' })}
                  searchable
                />
                <Group grow>
                  <TextInput
                    label="Propriété"
                    placeholder="Ex: temperature"
                    value={c.property ?? ''}
                    onChange={(e) => updateCondition(i, { property: e.currentTarget.value })}
                  />
                  <Select
                    label="Opérateur"
                    data={operatorOptions}
                    value={c.operator ?? 'eq'}
                    onChange={(v) => updateCondition(i, { operator: v ?? 'eq' })}
                  />
                  <TextInput
                    label="Valeur"
                    placeholder="Ex: 24"
                    value={c.value !== undefined ? String(c.value) : ''}
                    onChange={(e) => updateCondition(i, { value: e.currentTarget.value })}
                  />
                </Group>
              </Stack>
            )}

            {c.type === 'device_diff' && (
              <Stack gap="xs">
                <Group grow>
                  <Select
                    label="Appareil A"
                    placeholder="Sélectionner un appareil"
                    data={deviceOptions}
                    value={c.deviceIdA ?? ''}
                    onChange={(v) => updateCondition(i, { deviceIdA: v ?? '' })}
                    searchable
                  />
                  <TextInput
                    label="Propriété A"
                    placeholder="Ex: temperature"
                    value={c.propertyA ?? ''}
                    onChange={(e) => updateCondition(i, { propertyA: e.currentTarget.value })}
                  />
                </Group>
                <Group grow>
                  <Select
                    label="Appareil B"
                    placeholder="Sélectionner un appareil"
                    data={deviceOptions}
                    value={c.deviceIdB ?? ''}
                    onChange={(v) => updateCondition(i, { deviceIdB: v ?? '' })}
                    searchable
                  />
                  <TextInput
                    label="Propriété B"
                    placeholder="Ex: temperature"
                    value={c.propertyB ?? ''}
                    onChange={(e) => updateCondition(i, { propertyB: e.currentTarget.value })}
                  />
                </Group>
                <Group grow>
                  <Select
                    label="Opérateur (A − B)"
                    data={diffOperatorOptions}
                    value={c.operator ?? 'gte'}
                    onChange={(v) => updateCondition(i, { operator: v ?? 'gte' })}
                  />
                  <NumberInput
                    label="Seuil"
                    value={c.threshold ?? 0}
                    onChange={(v) => updateCondition(i, { threshold: Number(v) || 0 })}
                  />
                </Group>
                <Text size="xs" c="dimmed">
                  Vraie si (A − B) {operatorSymbol(c.operator)} seuil
                </Text>
              </Stack>
            )}
          </Card>
        ))}
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={addCondition}
        >
          Ajouter une condition
        </Button>

        <Title order={5}>Action</Title>
        <Select
          label="Appareil cible"
          placeholder="Sélectionner un appareil"
          data={deviceOptions}
          value={actionDeviceId}
          onChange={(v) => setActionDeviceId(v ?? '')}
          searchable
        />
        <JsonInput
          label="Commande (JSON)"
          placeholder='{"state": "ON"}'
          value={actionCommand}
          onChange={setActionCommand}
          minRows={3}
          formatOnBlur
          validationError="JSON invalide"
        />

        <Button onClick={handleSubmit} loading={save.isPending}>
          {scenario ? 'Enregistrer' : 'Créer'}
        </Button>
      </Stack>
    </Modal>
  );
}

function ScenarioTypeBadge({ trigger }: { trigger: Trigger }) {
  if (trigger.type === 'cron') {
    return (
      <Badge size="sm" variant="light" color="grape" leftSection={<IconClock size={12} />}>
        Planification horaire
      </Badge>
    );
  }
  return (
    <Badge size="sm" variant="light" color="teal" leftSection={<IconDeviceDesktop size={12} />}>
      État d&apos;un appareil
    </Badge>
  );
}

function TriggerSummary({
  trigger,
  devices,
}: {
  trigger: Trigger;
  devices: Device[];
}) {
  if (trigger.type === 'cron') {
    const delay =
      trigger.randomDelayMax && trigger.randomDelayMax > 0
        ? ` (+${trigger.randomDelayMin ?? 0}–${trigger.randomDelayMax}min aléatoire)`
        : '';
    return (
      <Group gap={6}>
        <IconClock size={14} />
        <Text size="sm">
          {trigger.cron}{delay}
        </Text>
      </Group>
    );
  }

  const device = devices.find((d) => d.id === trigger.deviceId);
  return (
    <Group gap={6}>
      <IconDeviceDesktop size={14} />
      <Text size="sm">
        {device?.name ?? trigger.deviceId} · {trigger.property}{' '}
        {operatorSymbol(trigger.operator)} {String(trigger.value)}
      </Text>
    </Group>
  );
}

function ConditionsSummary({
  conditions,
  devices,
}: {
  conditions: Condition[];
  devices: Device[];
}) {
  if (!conditions.length) return null;

  return (
    <Stack gap={2} mt={4}>
      {conditions.map((c, i) => {
        if (c.type === 'time_range') {
          return (
            <Badge key={i} size="xs" variant="outline">
              {c.from}–{c.to}
            </Badge>
          );
        }
        if (c.type === 'device_state') {
          const device = devices.find((d) => d.id === c.deviceId);
          return (
            <Badge key={i} size="xs" variant="outline">
              {device?.name ?? c.deviceId} {c.property} {operatorSymbol(c.operator)}{' '}
              {String(c.value)}
            </Badge>
          );
        }
        if (c.type === 'device_diff') {
          const deviceA = devices.find((d) => d.id === c.deviceIdA);
          const deviceB = devices.find((d) => d.id === c.deviceIdB);
          return (
            <Badge key={i} size="xs" variant="outline">
              {deviceA?.name ?? c.deviceIdA} − {deviceB?.name ?? c.deviceIdB}{' '}
              {operatorSymbol(c.operator)} {c.threshold}
            </Badge>
          );
        }
        return null;
      })}
    </Stack>
  );
}

function ActionSummary({
  actions,
  devices,
}: {
  actions: Action[];
  devices: Device[];
}) {
  return (
    <Stack gap={2}>
      {actions.map((a, i) => {
        const device = devices.find((d) => d.id === a.deviceId);
        return (
          <Text key={i} size="sm">
            {device?.name ?? a.deviceId} → {JSON.stringify(a.command)}
          </Text>
        );
      })}
    </Stack>
  );
}

function TestButton({
  scenarioId,
  onTest,
  loading,
}: {
  scenarioId: string;
  onTest: (id: string) => void;
  loading: boolean;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened} withArrow shadow="md">
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          color="blue"
          onClick={() => setOpened(true)}
          loading={loading}
          title="Tester maintenant"
        >
          <IconPlayerPlay size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={500}>Exécuter maintenant ?</Text>
          <Text size="xs" c="dimmed">
            Les actions seront exécutées immédiatement, sans attendre le déclencheur.
          </Text>
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="default" onClick={() => setOpened(false)}>
              Annuler
            </Button>
            <Button
              size="xs"
              color="blue"
              onClick={() => {
                onTest(scenarioId);
                setOpened(false);
              }}
            >
              Exécuter
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export default function ScenariosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formOpened, setFormOpened] = useState(false);
  const [editingScenario, setEditingScenario] = useState<
    Scenario | undefined
  >();

  const { data: scenarios, isLoading } = useQuery<Scenario[]>({
    queryKey: ['scenarios'],
    queryFn: () => api.get('/scenarios').then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
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

  const testScenario = useMutation({
    mutationFn: (id: string) => api.post(`/scenarios/${id}/test`),
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
            value="scenarios"
            onChange={(v) => v === 'devices' && router.push('/')}
          >
            <Tabs.List>
              <Tabs.Tab
                value="devices"
                leftSection={<IconSmartHome size={16} />}
              >
                Appareils
              </Tabs.Tab>
              <Tabs.Tab
                value="scenarios"
                leftSection={<IconScript size={16} />}
              >
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
              href="http://localhost:8080"
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
          <Title order={4}>Scénarios</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setEditingScenario(undefined);
              setFormOpened(true);
            }}
          >
            Nouveau scénario
          </Button>
        </Group>

        {isLoading ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : !scenarios?.length ? (
          <Center h={200}>
            <Stack align="center" gap="xs">
              <IconScript size={48} opacity={0.5} />
              <Text c="dimmed">Aucun scénario</Text>
              <Text c="dimmed" size="sm">
                Créez un scénario pour automatiser vos appareils
              </Text>
            </Stack>
          </Center>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Actif</Table.Th>
                <Table.Th>Nom</Table.Th>
                <Table.Th>Type de scénario</Table.Th>
                <Table.Th>Déclencheur</Table.Th>
                <Table.Th>Conditions</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th>Prochaine exécution</Table.Th>
                <Table.Th>Dernière exécution</Table.Th>
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
                      onChange={(e) =>
                        toggleEnabled.mutate({
                          id: s.id,
                          enabled: e.currentTarget.checked,
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500}>{s.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <ScenarioTypeBadge trigger={s.trigger} />
                  </Table.Td>
                  <Table.Td>
                    <TriggerSummary
                      trigger={s.trigger}
                      devices={devices ?? []}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ConditionsSummary conditions={s.conditions} devices={devices ?? []} />
                  </Table.Td>
                  <Table.Td>
                    <ActionSummary
                      actions={s.actions}
                      devices={devices ?? []}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {s.nextRun
                        ? new Date(s.nextRun).toLocaleString('fr-FR')
                        : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={0}>
                      <Text size="sm" c="dimmed">
                        {s.lastRun
                          ? new Date(s.lastRun).toLocaleString('fr-FR')
                          : '—'}
                      </Text>
                      {s.runCount > 0 && (
                        <Text size="xs" c="dimmed">
                          {s.runCount} exécution{s.runCount > 1 ? 's' : ''}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Group gap="xs">
                      <TestButton
                        scenarioId={s.id}
                        onTest={(id) => testScenario.mutate(id)}
                        loading={testScenario.isPending}
                      />
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => deleteScenario.mutate(s.id)}
                        title="Supprimer"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <ScenarioForm
          key={editingScenario?.id ?? 'new'}
          opened={formOpened}
          onClose={() => setFormOpened(false)}
          scenario={editingScenario}
        />
      </AppShell.Main>
    </AppShell>
  );
}
