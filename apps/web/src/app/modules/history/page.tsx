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
import { IconSmartHome, IconNetwork, IconChevronLeft, IconPlus, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';
import { ValueChart, ChartType } from '@/components/ValueChart';
import { CHART_COLORS, DeviceEvent, extractValueKeys, buildSeries, generateId, formatValueLabel } from '@/lib/history';

interface Device {
  id: string;
  name: string;
  trackHistory: boolean;
}

const RANGE_OPTIONS = [
  { value: '1', label: '1 h' },
  { value: '24', label: '24 h' },
  { value: '168', label: '7 j' },
  { value: '720', label: '30 j' },
  { value: '', label: 'Tout' },
];

interface PanelConfig {
  id: string;
  deviceId: string | null;
  valueKey: string | null;
  chartType: ChartType;
}

function ChartPanel({
  panel,
  devices,
  fromIso,
  color,
  onChange,
  onRemove,
}: {
  panel: PanelConfig;
  devices: Device[];
  fromIso: string | undefined;
  color: string;
  onChange: (next: Partial<PanelConfig>) => void;
  onRemove: () => void;
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
            onChange={(value) => onChange({ deviceId: value, valueKey: null })}
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
            value={panel.chartType}
            onChange={(value) => onChange({ chartType: value as ChartType })}
            data={[
              { label: 'Ligne', value: 'line' },
              { label: 'Barres', value: 'bar' },
              { label: 'Aire', value: 'area' },
            ]}
          />
        </Group>
        <ActionIcon variant="subtle" color="red" onClick={onRemove}>
          <IconTrash size={16} />
        </ActionIcon>
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
  const [hostname, setHostname] = useState('localhost');
  const [rangeHours, setRangeHours] = useState('168');
  const [panels, setPanels] = useState<PanelConfig[]>([
    { id: generateId(), deviceId: null, valueKey: null, chartType: 'line' },
  ]);

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const trackedDevices = (devices ?? []).filter((d) => d.trackHistory);

  const fromIso = useMemo(
    () => (rangeHours ? new Date(Date.now() - parseInt(rangeHours, 10) * 3600_000).toISOString() : undefined),
    [rangeHours],
  );

  const addPanel = () => {
    setPanels((prev) => [...prev, { id: generateId(), deviceId: null, valueKey: null, chartType: 'line' }]);
  };

  const updatePanel = (id: string, next: Partial<PanelConfig>) => {
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));
  };

  const removePanel = (id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
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
                    onChange={(next) => updatePanel(panel.id, next)}
                    onRemove={() => removePanel(panel.id)}
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
