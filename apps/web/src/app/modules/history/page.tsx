'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Stack,
  Button,
  Tooltip,
  Card,
  ActionIcon,
  Select,
  SegmentedControl,
  Center,
  Loader,
} from '@mantine/core';
import { IconSmartHome, IconNetwork, IconChevronLeft, IconPlus, IconTrash, IconDeviceFloppy } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';
import { ValueChart, ChartType } from '@/components/ValueChart';
import { LatestValue } from '@/components/LatestValue';
import {
  CHART_COLORS,
  DeviceEvent,
  DisplayType,
  DisplayPreference,
  extractValueKeys,
  buildSeries,
  generateId,
  formatValueLabel,
  latestValue,
  parseDisplayPreferences,
} from '@/lib/history';

interface Device {
  id: string;
  name: string;
  trackHistory: boolean;
  displayPreferences: string;
}

const RANGE_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: '0.5', label: '30 min' },
  { value: '1', label: 'Heure' },
  { value: '24', label: 'Jour' },
  { value: '168', label: 'Semaine' },
  { value: '720', label: 'Mois' },
  { value: '8760', label: 'Année' },
];

interface PanelConfig {
  id: string;
  deviceId: string | null;
  valueKey: string | null;
  displayType: DisplayType;
  chartType: ChartType;
}

function emptyPanel(): PanelConfig {
  return { id: generateId(), deviceId: null, valueKey: null, displayType: 'chart', chartType: 'line' };
}

function ChartPanel({
  panel,
  devices,
  fromIso,
  color,
  onSelectDevice,
  onChange,
  onRemove,
  onSaveDefault,
  isSavingDefault,
}: {
  panel: PanelConfig;
  devices: Device[];
  fromIso: string | undefined;
  color: string;
  onSelectDevice: (deviceId: string | null) => void;
  onChange: (next: Partial<PanelConfig>) => void;
  onRemove: () => void;
  onSaveDefault: () => void;
  isSavingDefault: boolean;
}) {
  const { data: history, isLoading } = useQuery<DeviceEvent[]>({
    queryKey: ['device-history', panel.deviceId, fromIso],
    queryFn: () =>
      api
        .get(`/devices/${panel.deviceId}/history`, { params: { limit: 1000, from: fromIso } })
        .then((r) => r.data),
    enabled: !!panel.deviceId,
  });

  const valueKeys = history ? extractValueKeys(history) : [];
  const series = history && panel.valueKey ? buildSeries(history, panel.valueKey) : [];
  const latest = history && panel.valueKey ? latestValue(history, panel.valueKey) : null;
  const device = devices.find((d) => d.id === panel.deviceId);

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Group gap="sm" wrap="wrap">
          <Select
            size="xs"
            placeholder="Appareil"
            data={devices.map((d) => ({ value: d.id, label: d.name }))}
            value={panel.deviceId}
            onChange={onSelectDevice}
            w={200}
            searchable
          />
          <Select
            size="xs"
            placeholder="Valeur"
            data={valueKeys.map((k) => ({ value: k, label: formatValueLabel(k) }))}
            value={panel.valueKey}
            onChange={(value) => onChange({ valueKey: value })}
            disabled={!panel.deviceId}
            w={200}
          />
          <SegmentedControl
            size="xs"
            value={panel.displayType}
            onChange={(value) => onChange({ displayType: value as DisplayType })}
            data={[
              { label: 'Valeur', value: 'value' },
              { label: 'Graphique', value: 'chart' },
            ]}
          />
          {panel.displayType === 'chart' && (
            <SegmentedControl
              size="xs"
              value={panel.chartType}
              onChange={(value) => onChange({ chartType: value as ChartType })}
              data={[
                { label: 'Ligne', value: 'line' },
                { label: 'Barres', value: 'bar' },
                { label: 'Aire', value: 'area' },
              ]}
            />
          )}
        </Group>
        <Group gap={4}>
          <Tooltip label="Enregistrer comme réglage par défaut de cet appareil">
            <ActionIcon
              variant="subtle"
              disabled={!panel.deviceId || !panel.valueKey}
              loading={isSavingDefault}
              onClick={onSaveDefault}
            >
              <IconDeviceFloppy size={16} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon variant="subtle" color="red" onClick={onRemove}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {!panel.deviceId || !panel.valueKey ? (
        <Center h={220}>
          <Text size="sm" c="dimmed">
            Choisissez un appareil et une valeur à afficher.
          </Text>
        </Center>
      ) : isLoading ? (
        <Center h={220}>
          <Loader size="sm" />
        </Center>
      ) : panel.displayType === 'value' ? (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {device?.name} · {formatValueLabel(panel.valueKey)}
          </Text>
          <LatestValue valueKey={panel.valueKey} value={latest} />
        </Stack>
      ) : series.length === 0 ? (
        <Center h={220}>
          <Text size="sm" c="dimmed">
            Aucune donnée pour cette période.
          </Text>
        </Center>
      ) : (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {device?.name} · {formatValueLabel(panel.valueKey)}
          </Text>
          <ValueChart series={series} chartType={panel.chartType} color={color} valueKey={panel.valueKey} />
        </Stack>
      )}
    </Card>
  );
}

export default function HistoryModulePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [hostname, setHostname] = useState('localhost');
  const [rangeHours, setRangeHours] = useState('168');
  const [panels, setPanels] = useState<PanelConfig[]>([emptyPanel()]);

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const trackedDevices = (devices ?? []).filter((d) => d.trackHistory);

  const fromIso = useMemo(
    () => (rangeHours ? new Date(Date.now() - parseFloat(rangeHours) * 3600_000).toISOString() : undefined),
    [rangeHours],
  );

  const addPanel = () => {
    setPanels((prev) => [...prev, emptyPanel()]);
  };

  const updatePanel = (id: string, next: Partial<PanelConfig>) => {
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));
  };

  const removePanel = (id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  };

  // Appliquer les préférences d'affichage par défaut de l'appareil (réglées dans
  // Réglages > Appareils) : la sélection remplace ce panel par un panel par métrique.
  const selectDeviceForPanel = (panelId: string, deviceId: string | null) => {
    const device = (devices ?? []).find((d) => d.id === deviceId);
    const prefs = device ? parseDisplayPreferences(device.displayPreferences) : [];

    if (!deviceId || prefs.length === 0) {
      updatePanel(panelId, { deviceId, valueKey: null });
      return;
    }

    const newPanels = prefs.map((pref) => ({
      id: generateId(),
      deviceId,
      valueKey: pref.valueKey,
      displayType: pref.displayType,
      chartType: pref.chartType ?? ('line' as ChartType),
    }));

    setPanels((prev) => {
      const index = prev.findIndex((p) => p.id === panelId);
      if (index === -1) return prev;
      return [...prev.slice(0, index), ...newPanels, ...prev.slice(index + 1)];
    });
  };

  const saveDefault = useMutation({
    mutationFn: ({ deviceId, prefs }: { deviceId: string; prefs: DisplayPreference[] }) =>
      api.patch(`/devices/${deviceId}/display-preferences`, prefs),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  // Ajoute/replace ce panel dans les préférences enregistrées de l'appareil, sans
  // toucher aux autres métriques déjà enregistrées pour ce même appareil.
  const savePanelAsDefault = (panel: PanelConfig) => {
    if (!panel.deviceId || !panel.valueKey) return;
    const device = (devices ?? []).find((d) => d.id === panel.deviceId);
    const existing = device ? parseDisplayPreferences(device.displayPreferences) : [];
    const next: DisplayPreference[] = [
      ...existing.filter((p) => p.valueKey !== panel.valueKey),
      { valueKey: panel.valueKey, displayType: panel.displayType, chartType: panel.chartType },
    ];
    saveDefault.mutate({ deviceId: panel.deviceId, prefs: next });
  };

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconSmartHome size={28} />
            <Title order={3}>Skbox</Title>
          </Group>
          <Group gap="md">
            <AppNav active="modules" />
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
            <Text size="sm">Historique</Text>
          </Group>

          {trackedDevices.length === 0 ? (
            <Text size="sm" c="dimmed">
              Aucun appareil n'est historisé. Activez "Historiser" pour au moins un appareil dans Réglages
              &gt; Appareils.
            </Text>
          ) : (
            <>
              <Group justify="space-between">
                <SegmentedControl size="xs" value={rangeHours} onChange={setRangeHours} data={RANGE_OPTIONS} />
                <Button leftSection={<IconPlus size={16} />} variant="light" size="xs" onClick={addPanel}>
                  Ajouter un graphique
                </Button>
              </Group>

              <Stack gap="md">
                {panels.map((panel, i) => (
                  <ChartPanel
                    key={panel.id}
                    panel={panel}
                    devices={trackedDevices}
                    fromIso={fromIso}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                    onSelectDevice={(deviceId) => selectDeviceForPanel(panel.id, deviceId)}
                    onChange={(next) => updatePanel(panel.id, next)}
                    onRemove={() => removePanel(panel.id)}
                    onSaveDefault={() => savePanelAsDefault(panel)}
                    isSavingDefault={saveDefault.isPending && saveDefault.variables?.deviceId === panel.deviceId}
                  />
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
