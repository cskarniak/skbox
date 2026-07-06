'use client';

import { Title, Text, Stack, Table, Switch, Badge, MultiSelect, ActionIcon, Modal, Tooltip, Center, Loader, ScrollArea, Button, TextInput, Group, Alert, Checkbox, SegmentedControl } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconHistory, IconTrash, IconAlertTriangle, IconAdjustments } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import {
  DisplayPreference,
  DisplayType,
  ChartType,
  extractValueKeys,
  formatValueLabel,
  parseDisplayPreferences,
} from '@/lib/history';

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
  displayPreferences: string;
}

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
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[...history].reverse().map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>{new Date(entry.timestamp).toLocaleString('fr-FR')}</Table.Td>
                    <Table.Td ff="monospace" style={{ wordBreak: 'break-all' }}>
                      {entry.data}
                    </Table.Td>
                  </Table.Tr>
                ))}
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

  const savePrefs = useMutation({
    mutationFn: (next: DisplayPreference[]) => api.patch(`/devices/${device.id}/display-preferences`, next),
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

  return (
    <Modal opened={opened} onClose={onClose} title={`Historique par défaut — ${device.name}`} size="md">
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
            Choisissez les valeurs affichées par défaut lorsque cet appareil est sélectionné dans le module
            Historique, et leur forme (valeur ou graphique).
          </Text>
          <Stack gap="sm">
            {valueKeys.map((key) => {
              const pref = prefs.find((p) => p.valueKey === key);
              return (
                <Group key={key} justify="space-between" wrap="wrap">
                  <Checkbox
                    label={formatValueLabel(key)}
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
              );
            })}
          </Stack>
          <Group justify="flex-end">
            <Button
              size="xs"
              loading={savePrefs.isPending}
              onClick={() => savePrefs.mutate(prefs, { onSuccess: onClose })}
            >
              Enregistrer
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function DeviceRow({ device, themes }: { device: Device; themes: Theme[] }) {
  const queryClient = useQueryClient();
  const [historyOpened, { open: openHistory, close: closeHistory }] = useDisclosure(false);
  const [prefsOpened, { open: openPrefs, close: closePrefs }] = useDisclosure(false);

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
      <Table.Td>
        <Group gap={4} wrap="nowrap">
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
        </Group>
        {device.trackHistory && (
          <>
            <HistoryModal device={device} opened={historyOpened} onClose={closeHistory} />
            <PreferencesModal device={device} opened={prefsOpened} onClose={closePrefs} />
          </>
        )}
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
            <Table.Th>Historique</Table.Th>
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
