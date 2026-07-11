'use client';

import { AppShell, Title, Text, Stack, Table, Switch, Badge, MultiSelect, ActionIcon, Modal, Tooltip, Center, Loader, ScrollArea, Button, TextInput, NumberInput, Group, Alert, Checkbox, SegmentedControl, Divider, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSmartHome, IconHistory, IconTrash, IconAlertTriangle, IconAdjustments, IconBattery, IconLink, IconId } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { AppNav } from '@/components/AppNav';
import {
  DisplayPreference,
  DisplayType,
  ChartType,
  HistoryFieldConfig,
  extractValueKeys,
  formatValueLabel,
  parseDisplayPreferences,
  parseHistoryFieldConfig,
} from '@/lib/history';

interface Theme {
  id: string;
  name: string;
  order: number;
  devices: { id: string }[];
}

interface NamedListItem {
  id: string;
  name: string;
  icon: string | null;
  order: number;
}

interface Device {
  id: string;
  name: string;
  protocol: string;
  type: string;
  status: string;
  room: string | null;
  parentObject: string | null;
  visible: boolean;
  active: boolean;
  trackHistory: boolean;
  displayPreferences: string;
  historyFieldConfig: string;
  batteryChangePendingUntil: string | null;
  rfxcomId: string | null;
  ieeeAddress: string | null;
  vendor: string | null;
  model: string | null;
  lastSeen: string;
  state: string;
  temperatureOffset: number;
  humidityOffset: number;
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  light: 'Lumière',
  switch: 'Interrupteur',
  plug: 'Prise',
  sensor_temperature: 'Capteur température',
  sensor_humidity: 'Capteur humidité',
  sensor_motion: 'Capteur de mouvement',
  sensor_door: 'Capteur ouverture',
  sensor_rain: 'Capteur pluie',
  sensor_wind: 'Capteur vent',
  sensor_uv: 'Capteur UV',
  sensor_power: 'Capteur de puissance',
  thermostat: 'Thermostat',
  remote: 'Télécommande',
};

interface DeviceEvent {
  id: string;
  data: string;
  timestamp: string;
}

function ClearHistoryConfirm({ deviceId, onCleared }: { deviceId: string; onCleared: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const clearHistory = useMutation({
    mutationFn: () => api.delete(`/devices/${deviceId}/history`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-history', deviceId] });
      setConfirming(false);
      setConfirmText('');
      onCleared();
    },
  });

  if (!confirming) {
    return (
      <Button
        size="xs"
        color="red"
        variant="light"
        leftSection={<IconTrash size={14} />}
        onClick={() => setConfirming(true)}
      >
        Vider l'historique
      </Button>
    );
  }

  return (
    <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Suppression définitive">
      <Stack gap="xs">
        <Text size="sm">
          Toutes les valeurs enregistrées pour cet appareil seront supprimées définitivement. Tapez{' '}
          <Text span fw={700}>
            OUI
          </Text>{' '}
          pour confirmer.
        </Text>
        <Group gap="xs">
          <TextInput
            size="xs"
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            placeholder="OUI"
            w={120}
          />
          <Button
            size="xs"
            color="red"
            disabled={confirmText !== 'OUI'}
            loading={clearHistory.isPending}
            onClick={() => clearHistory.mutate()}
          >
            Confirmer
          </Button>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              setConfirming(false);
              setConfirmText('');
            }}
          >
            Annuler
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}

function HistoryModal({ device, opened, onClose }: { device: Device; opened: boolean; onClose: () => void }) {
  const { data: history, isLoading } = useQuery<DeviceEvent[]>({
    queryKey: ['device-history', device.id],
    queryFn: () => api.get(`/devices/${device.id}/history`, { params: { limit: 200 } }).then((r) => r.data),
    enabled: opened,
  });

  return (
    <Modal opened={opened} onClose={onClose} title={`Historique — ${device.name}`} size="lg">
      <Stack gap="md">
        {history && history.length > 0 && (
          <Group justify="flex-end">
            <ClearHistoryConfirm deviceId={device.id} onCleared={() => {}} />
          </Group>
        )}

        {isLoading ? (
          <Center h={150}>
            <Loader size="sm" />
          </Center>
        ) : !history || history.length === 0 ? (
          <Text size="sm" c="dimmed">
            Aucune valeur enregistrée pour le moment.
          </Text>
        ) : (
          <ScrollArea h={400}>
            <Table striped highlightOnHover fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={140}>Date</Table.Th>
                  <Table.Th>Valeur</Table.Th>
                  <Table.Th>Condition de déclenchement</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[...history].reverse().map((entry) => {
                  let parsed: Record<string, unknown> = {};
                  try {
                    parsed = JSON.parse(entry.data);
                  } catch {
                    // valeur non-JSON (ancien format) : affichée telle quelle ci-dessous
                  }
                  const scenario = parsed._scenario as
                    | { scenarioName: string; values: { deviceName: string; property: string; value: unknown }[]; conditions?: string[] }
                    | undefined;
                  const { _scenario: _omit, ...rest } = parsed;
                  const displayValue = scenario ? JSON.stringify(rest) : entry.data;

                  return (
                    <Table.Tr key={entry.id}>
                      <Table.Td>{new Date(entry.timestamp).toLocaleString('fr-FR')}</Table.Td>
                      <Table.Td ff="monospace" style={{ wordBreak: 'break-all' }}>
                        {displayValue}
                      </Table.Td>
                      <Table.Td fz="xs">
                        {scenario ? (
                          <Stack gap={2}>
                            <Text fz="xs" fw={600}>
                              {scenario.scenarioName}
                            </Text>
                            {(scenario.conditions ?? []).map((c, i) => (
                              <Text fz="xs" c="dimmed" key={i}>
                                {c}
                              </Text>
                            ))}
                            {scenario.values.map((v, i) => (
                              <Text fz="xs" c="dimmed" key={i}>
                                {v.deviceName} ({v.property}) : {String(v.value)}
                              </Text>
                            ))}
                          </Stack>
                        ) : (
                          <Text fz="xs" c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>
    </Modal>
  );
}

function PreferencesModal({ device, opened, onClose }: { device: Device; opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useQuery<DeviceEvent[]>({
    queryKey: ['device-history', device.id, 'preferences'],
    queryFn: () => api.get(`/devices/${device.id}/history`, { params: { limit: 500 } }).then((r) => r.data),
    enabled: opened,
  });

  const [prefs, setPrefs] = useState<DisplayPreference[]>(() => parseDisplayPreferences(device.displayPreferences));
  const [historyConfig, setHistoryConfig] = useState<HistoryFieldConfig[]>(() =>
    parseHistoryFieldConfig(device.historyFieldConfig),
  );

  const savePrefs = useMutation({
    mutationFn: () =>
      Promise.all([
        api.patch(`/devices/${device.id}/display-preferences`, prefs),
        api.patch(`/devices/${device.id}/history-config`, historyConfig),
      ]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  const valueKeys = history ? extractValueKeys(history) : [];

  const toggleKey = (valueKey: string, checked: boolean) => {
    setPrefs((prev) =>
      checked
        ? [...prev, { valueKey, displayType: 'chart', chartType: 'line' }]
        : prev.filter((p) => p.valueKey !== valueKey),
    );
  };

  const updateKey = (valueKey: string, next: Partial<DisplayPreference>) => {
    setPrefs((prev) => prev.map((p) => (p.valueKey === valueKey ? { ...p, ...next } : p)));
  };

  const getHistoryConfig = (valueKey: string): HistoryFieldConfig =>
    historyConfig.find((c) => c.valueKey === valueKey) ?? { valueKey, enabled: true };

  const updateHistoryConfig = (valueKey: string, next: Partial<HistoryFieldConfig>) => {
    setHistoryConfig((prev) => {
      const existing = prev.find((c) => c.valueKey === valueKey);
      const merged = { ...(existing ?? { valueKey, enabled: true }), ...next };
      return existing ? prev.map((c) => (c.valueKey === valueKey ? merged : c)) : [...prev, merged];
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Historique — ${device.name}`} size="md">
      {isLoading ? (
        <Center h={150}>
          <Loader size="sm" />
        </Center>
      ) : valueKeys.length === 0 ? (
        <Text size="sm" c="dimmed">
          Aucune valeur historisée pour le moment pour cet appareil.
        </Text>
      ) : (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Pour chaque valeur : l'historiser ou non, à partir de quelle variation minimum enregistrer un
            point, et si elle s'affiche par défaut (et sous quelle forme) dans le module Historique.
          </Text>
          <Stack gap="md">
            {valueKeys.map((key) => {
              const pref = prefs.find((p) => p.valueKey === key);
              const cfg = getHistoryConfig(key);
              return (
                <Stack key={key} gap="xs" pb="sm">
                  <Text size="sm" fw={500}>
                    {formatValueLabel(key)}
                  </Text>
                  <Group gap="md" wrap="wrap">
                    <Checkbox
                      label="Historiser"
                      checked={cfg.enabled}
                      onChange={(e) => updateHistoryConfig(key, { enabled: e.currentTarget.checked })}
                    />
                    {cfg.enabled && (
                      <NumberInput
                        size="xs"
                        label="Variation minimum"
                        placeholder="Toute variation"
                        value={cfg.minDelta}
                        onChange={(value) =>
                          updateHistoryConfig(key, { minDelta: typeof value === 'number' ? value : undefined })
                        }
                        min={0}
                        w={160}
                      />
                    )}
                  </Group>
                  <Group justify="space-between" wrap="wrap">
                    <Checkbox
                      label="Afficher par défaut"
                      checked={!!pref}
                      onChange={(e) => toggleKey(key, e.currentTarget.checked)}
                    />
                    {pref && (
                      <Group gap="xs">
                        <SegmentedControl
                          size="xs"
                          value={pref.displayType}
                          onChange={(value) => updateKey(key, { displayType: value as DisplayType })}
                          data={[
                            { label: 'Valeur', value: 'value' },
                            { label: 'Graphique', value: 'chart' },
                            { label: 'Liste', value: 'table' },
                          ]}
                        />
                        {pref.displayType === 'chart' && (
                          <SegmentedControl
                            size="xs"
                            value={pref.chartType ?? 'line'}
                            onChange={(value) => updateKey(key, { chartType: value as ChartType })}
                            data={[
                              { label: 'Ligne', value: 'line' },
                              { label: 'Barres', value: 'bar' },
                              { label: 'Aire', value: 'area' },
                            ]}
                          />
                        )}
                      </Group>
                    )}
                  </Group>
                  <Divider />
                </Stack>
              );
            })}
          </Stack>
          <Group justify="flex-end">
            <Button size="xs" loading={savePrefs.isPending} onClick={() => savePrefs.mutate(undefined, { onSuccess: onClose })}>
              Enregistrer
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function DeviceFicheModal({
  device,
  opened,
  onClose,
  rooms,
  parentObjects,
}: {
  device: Device;
  opened: boolean;
  onClose: () => void;
  rooms: NamedListItem[];
  parentObjects: NamedListItem[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(device.name);
  const [room, setRoom] = useState<string | null>(device.room);
  const [parentObject, setParentObject] = useState<string | null>(device.parentObject);
  const [type, setType] = useState<string | null>(device.type);
  const [temperatureOffset, setTemperatureOffset] = useState<number>(device.temperatureOffset ?? 0);
  const [humidityOffset, setHumidityOffset] = useState<number>(device.humidityOffset ?? 0);

  let deviceState: Record<string, unknown> = {};
  try {
    deviceState = JSON.parse(device.state || '{}');
  } catch {
    deviceState = {};
  }
  const hasTemperature = 'temperature' in deviceState;
  const hasHumidity = 'humidity' in deviceState;

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/devices/${device.id}`, {
        name,
        room,
        parentObject,
        type,
        temperatureOffset,
        humidityOffset,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      onClose();
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Fiche appareil">
      <Stack gap="md">
        <TextInput label="Nom" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Select
          label="Objet parent"
          placeholder="Aucun"
          clearable
          data={parentObjects.map((p) => ({ value: p.name, label: p.name }))}
          value={parentObject}
          onChange={setParentObject}
        />
        <Select
          label="Pièce"
          placeholder="Aucune"
          clearable
          data={rooms.map((r) => ({ value: r.name, label: r.name }))}
          value={room}
          onChange={setRoom}
        />
        <Select
          label="Catégorie"
          data={Object.entries(DEVICE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          value={type}
          onChange={setType}
        />

        {(hasTemperature || hasHumidity) && (
          <>
            <Divider label="Calibration" />
            <Group grow>
              {hasTemperature && (
                <NumberInput
                  label="Correction température (°C)"
                  description="Ajouté à chaque lecture, ex: +0.5"
                  value={temperatureOffset}
                  onChange={(v) => setTemperatureOffset(Number(v) || 0)}
                  decimalScale={1}
                  step={0.1}
                />
              )}
              {hasHumidity && (
                <NumberInput
                  label="Correction humidité (%)"
                  description="Ajouté à chaque lecture, ex: -3"
                  value={humidityOffset}
                  onChange={(v) => setHumidityOffset(Number(v) || 0)}
                  decimalScale={1}
                  step={0.1}
                />
              )}
            </Group>
          </>
        )}

        <Divider label="Caractéristiques" />
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            Protocole : {device.protocol}
          </Text>
          {device.vendor && (
            <Text size="sm" c="dimmed">
              Fabricant : {device.vendor}
            </Text>
          )}
          {device.model && (
            <Text size="sm" c="dimmed">
              Modèle : {device.model}
            </Text>
          )}
          {(device.rfxcomId || device.ieeeAddress) && (
            <Text size="sm" c="dimmed" ff="monospace">
              Code : {device.rfxcomId ?? device.ieeeAddress}
            </Text>
          )}
          <Text size="sm" c="dimmed">
            Dernier signal : {new Date(device.lastSeen).toLocaleString('fr-FR')}
          </Text>
        </Stack>

        <Group justify="flex-end">
          <Button size="xs" loading={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function MergeDeviceControl({ device, candidates }: { device: Device; candidates: Device[] }) {
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const merge = useMutation({
    mutationFn: () => api.post(`/devices/${targetId}/merge/${device.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['themes'] });
      close();
    },
  });

  const handleClose = () => {
    setTargetId(null);
    setConfirming(false);
    close();
  };

  const target = candidates.find((c) => c.id === targetId);

  return (
    <>
      <Tooltip label="Relier à un device existant (ex. après un changement de pile qui a créé un doublon)">
        <ActionIcon variant="subtle" onClick={open}>
          <IconLink size={16} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={opened} onClose={handleClose} title={`Relier « ${device.name} » à un device existant`}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            « {device.name} » sera supprimé et son état/identité actuels (dernier signal reçu) seront
            affectés au device choisi ci-dessous, qui conserve son nom, sa pièce et son historique.
          </Text>
          <Select
            label="Device existant à conserver"
            placeholder="Choisir un device"
            searchable
            data={candidates.map((c) => ({
              value: c.id,
              label: `${c.name}${c.room ? ` (${c.room})` : ''} — ${c.rfxcomId ?? c.ieeeAddress ?? c.id}`,
            }))}
            value={targetId}
            onChange={(value) => {
              setTargetId(value);
              setConfirming(false);
            }}
          />
          {target && !confirming && (
            <Group justify="flex-end">
              <Button size="xs" onClick={() => setConfirming(true)}>
                Relier
              </Button>
            </Group>
          )}
          {target && confirming && (
            <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
              <Stack gap="xs">
                <Text size="sm">
                  Confirmer : « {device.name} » sera définitivement supprimé et remplacé par « {target.name} ».
                </Text>
                <Group gap="xs">
                  <Button size="xs" color="orange" loading={merge.isPending} onClick={() => merge.mutate()}>
                    Oui
                  </Button>
                  <Button size="xs" variant="subtle" onClick={() => setConfirming(false)}>
                    Non
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}
        </Stack>
      </Modal>
    </>
  );
}

function DeleteDeviceConfirm({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [confirmText, setConfirmText] = useState('');

  const deleteDevice = useMutation({
    mutationFn: () => api.delete(`/devices/${device.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      handleClose();
    },
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de supprimer.') }),
  });

  const handleClose = () => {
    setConfirmText('');
    close();
  };

  return (
    <>
      <Tooltip label="Supprimer l'appareil">
        <ActionIcon variant="subtle" color="red" onClick={open}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={opened} onClose={handleClose} title={`Supprimer « ${device.name} » ?`}>
        <Stack gap="md">
          <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Suppression définitive">
            <Text size="sm">
              L'appareil et tout son historique seront supprimés définitivement (impossible si encore
              utilisé par un scénario ou un module). Tapez{' '}
              <Text span fw={700}>
                OUI
              </Text>{' '}
              pour confirmer.
            </Text>
          </Alert>
          <Group gap="xs">
            <TextInput
              size="xs"
              value={confirmText}
              onChange={(e) => setConfirmText(e.currentTarget.value)}
              placeholder="OUI"
              w={120}
            />
            <Button
              size="xs"
              color="red"
              disabled={confirmText !== 'OUI'}
              loading={deleteDevice.isPending}
              onClick={() => deleteDevice.mutate()}
            >
              Supprimer définitivement
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function DeviceRow({
  device,
  themes,
  candidates,
  rooms,
  parentObjects,
}: {
  device: Device;
  themes: Theme[];
  candidates: Device[];
  rooms: NamedListItem[];
  parentObjects: NamedListItem[];
}) {
  const queryClient = useQueryClient();
  const [historyOpened, { open: openHistory, close: closeHistory }] = useDisclosure(false);
  const [prefsOpened, { open: openPrefs, close: closePrefs }] = useDisclosure(false);
  const [ficheOpened, { open: openFiche, close: closeFiche }] = useDisclosure(false);

  const patchDevice = useMutation({
    mutationFn: (data: Partial<Pick<Device, 'visible' | 'active' | 'trackHistory'>>) =>
      api.patch(`/devices/${device.id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  const patchThemes = useMutation({
    mutationFn: (themeIds: string[]) => api.patch(`/devices/${device.id}/themes`, { themeIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['themes'] }),
  });

  const batteryChangeMode = useMutation({
    mutationFn: (start: boolean) =>
      start
        ? api.post(`/devices/${device.id}/battery-change-mode`)
        : api.delete(`/devices/${device.id}/battery-change-mode`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  const batteryChangePending =
    !!device.batteryChangePendingUntil && new Date(device.batteryChangePendingUntil) > new Date();

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
        {(device.rfxcomId || device.ieeeAddress) && (
          <Text size="xs" c="dimmed" ff="monospace">
            {device.rfxcomId ?? device.ieeeAddress}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {device.parentObject ? `${device.parentObject} · ` : ''}
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
      <Table.Td>
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Fiche appareil (nom, objet parent, pièce, catégorie, caractéristiques)">
            <ActionIcon variant="subtle" onClick={openFiche}>
              <IconId size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={device.trackHistory ? 'Voir historique' : 'Activez "Historiser" pour enregistrer des valeurs'}>
            <ActionIcon variant="subtle" disabled={!device.trackHistory} onClick={openHistory}>
              <IconHistory size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={device.trackHistory ? 'Configurer les valeurs par défaut' : 'Activez "Historiser" pour configurer les valeurs par défaut'}>
            <ActionIcon variant="subtle" disabled={!device.trackHistory} onClick={openPrefs}>
              <IconAdjustments size={16} />
            </ActionIcon>
          </Tooltip>
          {device.protocol === 'rf433' && (
            <Tooltip
              label={
                batteryChangePending
                  ? "Mode activé : le prochain signal reçu de ce type de capteur sera rattaché à cet appareil. Cliquez pour annuler."
                  : "Changement de pile : rattache le prochain signal reçu (même type de capteur) à cet appareil, au lieu de créer un nouveau device"
              }
            >
              <ActionIcon
                variant={batteryChangePending ? 'filled' : 'subtle'}
                color={batteryChangePending ? 'orange' : undefined}
                loading={batteryChangeMode.isPending}
                onClick={() => batteryChangeMode.mutate(!batteryChangePending)}
              >
                <IconBattery size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {candidates.length > 0 && <MergeDeviceControl device={device} candidates={candidates} />}
          <DeleteDeviceConfirm device={device} />
        </Group>
        {device.trackHistory && (
          <>
            <HistoryModal device={device} opened={historyOpened} onClose={closeHistory} />
            <PreferencesModal device={device} opened={prefsOpened} onClose={closePrefs} />
          </>
        )}
        <DeviceFicheModal
          device={device}
          opened={ficheOpened}
          onClose={closeFiche}
          rooms={rooms}
          parentObjects={parentObjects}
        />
      </Table.Td>
    </Table.Tr>
  );
}

export default function DevicesPage() {
  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const { data: themes } = useQuery<Theme[]>({
    queryKey: ['themes'],
    queryFn: () => api.get('/themes').then((r) => r.data),
  });

  const { data: rooms } = useQuery<NamedListItem[]>({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms').then((r) => r.data),
  });

  const { data: parentObjects } = useQuery<NamedListItem[]>({
    queryKey: ['parent-objects'],
    queryFn: () => api.get('/parent-objects').then((r) => r.data),
  });

  const [sortBy, setSortBy] = useState<'theme' | 'objet' | 'piece'>('theme');
  const [roomFilter, setRoomFilter] = useState<string | null>(null);
  const [parentObjectFilter, setParentObjectFilter] = useState<string | null>(null);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);

  const deviceThemeName = (device: Device): string => {
    const deviceThemes = (themes ?? []).filter((t) => t.devices.some((d) => d.id === device.id));
    if (deviceThemes.length === 0) return '￿';
    return deviceThemes.map((t) => t.name).sort((a, b) => a.localeCompare(b))[0];
  };

  const filteredDevices = (devices ?? [])
    .filter((d) => !roomFilter || d.room === roomFilter)
    .filter((d) => !parentObjectFilter || d.parentObject === parentObjectFilter)
    .filter((d) => !themeFilter || (themes ?? []).some((t) => t.id === themeFilter && t.devices.some((dev) => dev.id === d.id)))
    .sort((a, b) => {
      if (sortBy === 'theme') return deviceThemeName(a).localeCompare(deviceThemeName(b));
      if (sortBy === 'objet') return (a.parentObject ?? '￿').localeCompare(b.parentObject ?? '￿');
      return (a.room ?? '￿').localeCompare(b.room ?? '￿');
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
            <AppNav active="appareils" />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
      <Stack gap="lg">
      <div>
        <Title order={4}>Appareils</Title>
        <Text size="sm" c="dimmed">
          Contrôle la visibilité sur le dashboard, l'activation (les messages MQTT sont ignorés pour un
          appareil inactivé), l'historisation des valeurs et l'appartenance aux thèmes. Le nom, l'objet
          parent, la pièce et la catégorie de chaque appareil se modifient depuis sa fiche. La gestion des
          thèmes, pièces et objets se fait depuis Réglages &gt; Paramètres.
        </Text>
      </div>

      <Group gap="sm" wrap="wrap">
        <Select
          size="xs"
          placeholder="Trier par"
          label="Trier par"
          data={[
            { value: 'theme', label: 'Thème' },
            { value: 'objet', label: 'Objet' },
            { value: 'piece', label: 'Pièce' },
          ]}
          value={sortBy}
          onChange={(value) => setSortBy((value as 'theme' | 'objet' | 'piece') ?? 'theme')}
          allowDeselect={false}
          w={160}
        />
        <Select
          size="xs"
          placeholder="Toutes"
          label="Filtrer par objet"
          data={(parentObjects ?? []).map((p) => ({ value: p.name, label: p.name }))}
          value={parentObjectFilter}
          onChange={setParentObjectFilter}
          clearable
          w={200}
        />
        <Select
          size="xs"
          placeholder="Toutes"
          label="Filtrer par pièce"
          data={(rooms ?? []).map((r) => ({ value: r.name, label: r.name }))}
          value={roomFilter}
          onChange={setRoomFilter}
          clearable
          w={200}
        />
        <Select
          size="xs"
          placeholder="Tous"
          label="Filtrer par thème"
          data={(themes ?? []).map((t) => ({ value: t.id, label: t.name }))}
          value={themeFilter}
          onChange={setThemeFilter}
          clearable
          w={200}
        />
      </Group>

      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Appareil</Table.Th>
            <Table.Th>Objet / Pièce</Table.Th>
            <Table.Th>Statut</Table.Th>
            <Table.Th>Visible</Table.Th>
            <Table.Th>Actif</Table.Th>
            <Table.Th>Historiser</Table.Th>
            <Table.Th>Thèmes</Table.Th>
            <Table.Th>Historique</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filteredDevices.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              themes={themes ?? []}
              candidates={(devices ?? []).filter((d) => d.id !== device.id && d.protocol === device.protocol)}
              rooms={rooms ?? []}
              parentObjects={parentObjects ?? []}
            />
          ))}
        </Table.Tbody>
      </Table>
      </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
