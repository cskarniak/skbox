'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Stack,
  Button,
  Card,
  ActionIcon,
  Select,
  TextInput,
  SegmentedControl,
  SimpleGrid,
  Center,
  Loader,
  Popover,
} from '@mantine/core';
import {
  IconSmartHome,
  IconChevronLeft,
  IconPlus,
  IconTrash,
  IconEdit,
  IconCopy,
  IconDeviceFloppy,
  IconLayoutList,
  IconLayoutGrid,
  IconGridDots,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
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

interface HistoryTemplate {
  id: string;
  name: string;
  panels: string;
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

type ColumnLayout = 'list' | 'grid2' | 'grid3';

const columnLayoutCols: Record<ColumnLayout, Record<string, number>> = {
  list: { base: 1 },
  grid2: { base: 1, sm: 2 },
  grid3: { base: 1, sm: 2, lg: 3 },
};

const COLUMN_LAYOUT_STORAGE_KEY = 'skbox-history-columns';

function emptyPanel(): PanelConfig {
  return { id: generateId(), deviceId: null, valueKey: null, displayType: 'chart', chartType: 'line' };
}

// Un template ne stocke pas d'id de panel (ceux-ci sont régénérés à la volée pour
// servir de clé React) — seuls les champs qui décrivent réellement le graphique
// sont persistés. Un template sans graphique reste un tableau vide : on ne crée plus
// de graphique vide par défaut, l'utilisateur en ajoute un explicitement.
function parseTemplatePanels(raw: string): PanelConfig[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      id: generateId(),
      deviceId: p.deviceId ?? null,
      valueKey: p.valueKey ?? null,
      displayType: p.displayType === 'value' ? 'value' : 'chart',
      chartType: p.chartType === 'bar' || p.chartType === 'area' ? p.chartType : 'line',
    }));
  } catch {
    return [];
  }
}

function toTemplatePanels(panels: PanelConfig[]) {
  return panels.map(({ deviceId, valueKey, displayType, chartType }) => ({
    deviceId,
    valueKey,
    displayType,
    chartType,
  }));
}

function ConfirmDeleteButton({ message, onConfirm }: { message: string; onConfirm: () => void }) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onClose={() => setOpened(false)} position="bottom-end" withArrow>
      <Popover.Target>
        <ActionIcon variant="subtle" color="red" onClick={() => setOpened((o) => !o)}>
          <IconTrash size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm">{message}</Text>
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="subtle" onClick={() => setOpened(false)}>
              Non
            </Button>
            <Button
              size="xs"
              color="red"
              onClick={() => {
                setOpened(false);
                onConfirm();
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

function NamePopover({
  label,
  buttonLabel,
  icon,
  initialValue,
  onSubmit,
}: {
  label: string;
  buttonLabel: string;
  icon: React.ReactNode;
  initialValue?: string;
  onSubmit: (name: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [value, setValue] = useState(initialValue ?? '');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setOpened(false);
  };

  return (
    <Popover opened={opened} onClose={() => setOpened(false)} position="bottom" withArrow>
      <Popover.Target>
        <Button
          size="xs"
          variant="light"
          leftSection={icon}
          onClick={() => {
            // Toujours repartir de la valeur actuelle (nom du template courant), pas
            // celle capturée au premier montage — sinon, comme ce composant reste
            // monté d'un template à l'autre, "Dupliquer" proposerait encore le nom
            // de l'ancien template sélectionné.
            setValue(initialValue ?? '');
            setOpened((o) => !o);
          }}
        >
          {buttonLabel}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={220}>
          <Text size="sm">{label}</Text>
          <TextInput
            size="xs"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
          />
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="subtle" onClick={() => setOpened(false)}>
              Annuler
            </Button>
            <Button size="xs" disabled={!value.trim()} onClick={submit}>
              Valider
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function ChartPanel({
  panel,
  devices,
  fromIso,
  color,
  onSelectDevice,
  onChange,
  onRemove,
}: {
  panel: PanelConfig;
  devices: Device[];
  fromIso: string | undefined;
  color: string;
  onSelectDevice: (deviceId: string | null) => void;
  onChange: (next: Partial<PanelConfig>) => void;
  onRemove: () => void;
}) {
  const { data: history, isLoading } = useQuery<DeviceEvent[]>({
    queryKey: ['device-history', panel.deviceId, fromIso],
    queryFn: () =>
      api
        .get(`/devices/${panel.deviceId}/history`, { params: { maxPoints: 500, from: fromIso } })
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
        <ConfirmDeleteButton message="Supprimer ce graphique ?" onConfirm={onRemove} />
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

const LAST_TEMPLATE_SETTINGS_KEY = 'historyModule.lastTemplateId';

export default function HistoryModulePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [rangeHours, setRangeHours] = useState('168');
  const [columnLayout, setColumnLayout] = useState<ColumnLayout>('list');
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Instantané JSON du dernier état enregistré côté serveur : sert à savoir si
  // l'utilisateur a des modifications non enregistrées (icône "Enregistrer" visible).
  const [savedPanelsSnapshot, setSavedPanelsSnapshot] = useState('[]');

  useEffect(() => {
    const saved = localStorage.getItem(COLUMN_LAYOUT_STORAGE_KEY) as ColumnLayout | null;
    if (saved && ['list', 'grid2', 'grid3'].includes(saved)) {
      setColumnLayout(saved);
    }
  }, []);

  const handleColumnLayoutChange = (value: string) => {
    const layout = value as ColumnLayout;
    setColumnLayout(layout);
    localStorage.setItem(COLUMN_LAYOUT_STORAGE_KEY, layout);
  };

  const { data: templates } = useQuery<HistoryTemplate[]>({
    queryKey: ['history-templates'],
    queryFn: () => api.get('/history-templates').then((r) => r.data),
  });

  const { data: lastTemplateSetting } = useQuery<{ key: string; value: string | null }>({
    queryKey: ['settings', LAST_TEMPLATE_SETTINGS_KEY],
    queryFn: () => api.get(`/settings/${LAST_TEMPLATE_SETTINGS_KEY}`).then((r) => r.data),
  });

  // Choisit le template à afficher au premier chargement (le dernier consulté, ou à
  // défaut le premier de la liste) — une seule fois, avant quoi tout ajout manuel de
  // panel serait écrasé dès que ces requêtes répondent (même risque de course que
  // pour l'ancienne disposition anonyme, corrigé de la même façon : bloquer l'édition
  // tant que ce n'est pas hydraté).
  useEffect(() => {
    if (hydrated || templates === undefined || lastTemplateSetting === undefined) return;
    const preferred = lastTemplateSetting.value && templates.find((t) => t.id === lastTemplateSetting.value);
    const initial = preferred || templates[0];
    if (initial) {
      const initialPanels = parseTemplatePanels(initial.panels);
      setActiveTemplateId(initial.id);
      setPanels(initialPanels);
      setSavedPanelsSnapshot(JSON.stringify(toTemplatePanels(initialPanels)));
    }
    setHydrated(true);
  }, [templates, lastTemplateSetting, hydrated]);

  // Plus d'auto-save silencieux : les modifications restent locales tant que
  // l'utilisateur ne clique pas sur "Enregistrer" (voir savePanels ci-dessous).
  const isDirty = useMemo(
    () => JSON.stringify(toTemplatePanels(panels)) !== savedPanelsSnapshot,
    [panels, savedPanelsSnapshot],
  );

  const savePanels = useMutation({
    mutationFn: () => api.patch(`/history-templates/${activeTemplateId}`, { panels: toTemplatePanels(panels) }),
    onSuccess: () => {
      setSavedPanelsSnapshot(JSON.stringify(toTemplatePanels(panels)));
      queryClient.invalidateQueries({ queryKey: ['history-templates'] });
      notifications.show({ color: 'teal', title: 'Enregistré', message: 'Le graphique a été enregistré.' });
    },
    onError: () => {
      notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'enregistrer ce graphique." });
    },
  });

  const { data: devices } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });

  const trackedDevices = (devices ?? []).filter((d) => d.trackHistory);
  const activeTemplate = (templates ?? []).find((t) => t.id === activeTemplateId) ?? null;

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

  const switchTemplate = (id: string | null) => {
    if (!id || id === activeTemplateId) return;
    if (isDirty && !window.confirm('Des modifications non enregistrées seront perdues. Continuer ?')) return;
    const template = (templates ?? []).find((t) => t.id === id);
    if (!template) return;
    const nextPanels = parseTemplatePanels(template.panels);
    setActiveTemplateId(id);
    setPanels(nextPanels);
    setSavedPanelsSnapshot(JSON.stringify(toTemplatePanels(nextPanels)));
    api.put(`/settings/${LAST_TEMPLATE_SETTINGS_KEY}`, { value: id });
  };

  const createTemplate = useMutation({
    mutationFn: (name: string) =>
      api.post('/history-templates', { name, panels: toTemplatePanels([]) }).then((r) => r.data as HistoryTemplate),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['history-templates'] });
      setActiveTemplateId(created.id);
      setPanels([]);
      setSavedPanelsSnapshot('[]');
      api.put(`/settings/${LAST_TEMPLATE_SETTINGS_KEY}`, { value: created.id });
    },
  });

  const renameTemplate = useMutation({
    mutationFn: (name: string) => api.patch(`/history-templates/${activeTemplateId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history-templates'] }),
  });

  const duplicateTemplate = useMutation({
    mutationFn: (name: string) =>
      api
        .post('/history-templates', { name, panels: toTemplatePanels(panels) })
        .then((r) => r.data as HistoryTemplate),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['history-templates'] });
      setActiveTemplateId(created.id);
      setSavedPanelsSnapshot(JSON.stringify(toTemplatePanels(panels)));
      api.put(`/settings/${LAST_TEMPLATE_SETTINGS_KEY}`, { value: created.id });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/history-templates/${id}`),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['history-templates'] });
      if (deletedId !== activeTemplateId) return;
      const remaining = (templates ?? []).filter((t) => t.id !== deletedId);
      const next = remaining[0] ?? null;
      const nextPanels = next ? parseTemplatePanels(next.panels) : [];
      setActiveTemplateId(next?.id ?? null);
      setPanels(nextPanels);
      setSavedPanelsSnapshot(JSON.stringify(toTemplatePanels(nextPanels)));
      api.put(`/settings/${LAST_TEMPLATE_SETTINGS_KEY}`, { value: next?.id ?? '' });
    },
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
            <AppNav active="modules" />
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

          {!hydrated ? (
            // Tant que le template actif n'est pas déterminé, la moindre édition ici
            // serait écrasée dès que les requêtes répondent — on bloque donc
            // l'affichage plutôt que de risquer de perdre un graphique.
            <Center h={200}>
              <Loader size="sm" />
            </Center>
          ) : trackedDevices.length === 0 ? (
            <Text size="sm" c="dimmed">
              Aucun appareil n'est historisé. Activez "Historiser" pour au moins un appareil dans Réglages
              &gt; Appareils.
            </Text>
          ) : (
            <>
              <Group justify="space-between" wrap="wrap">
                <Group gap="xs" wrap="wrap">
                  <Select
                    size="xs"
                    placeholder="Template"
                    data={(templates ?? []).map((t) => ({ value: t.id, label: t.name }))}
                    value={activeTemplateId}
                    onChange={switchTemplate}
                    w={220}
                    searchable
                  />
                  <NamePopover
                    label="Nom du nouveau template"
                    buttonLabel="Nouveau"
                    icon={<IconPlus size={14} />}
                    onSubmit={(name) => createTemplate.mutate(name)}
                  />
                  {activeTemplate && (
                    <>
                      <NamePopover
                        label="Nouveau nom"
                        buttonLabel="Renommer"
                        icon={<IconEdit size={14} />}
                        initialValue={activeTemplate.name}
                        onSubmit={(name) => renameTemplate.mutate(name)}
                      />
                      <NamePopover
                        label="Nom de la copie"
                        buttonLabel="Dupliquer"
                        icon={<IconCopy size={14} />}
                        initialValue={`${activeTemplate.name} (copie)`}
                        onSubmit={(name) => duplicateTemplate.mutate(name)}
                      />
                      <ConfirmDeleteButton
                        message="Supprimer ce template ?"
                        onConfirm={() => deleteTemplate.mutate(activeTemplate.id)}
                      />
                    </>
                  )}
                </Group>
              </Group>

              {!activeTemplate ? (
                <Text size="sm" c="dimmed">
                  Aucun template. Cliquez sur "Nouveau" pour en créer un.
                </Text>
              ) : (
                <>
                  <Group justify="space-between" wrap="wrap">
                    <Group gap="xs" wrap="wrap">
                      <SegmentedControl size="xs" value={rangeHours} onChange={setRangeHours} data={RANGE_OPTIONS} />
                      <SegmentedControl
                        size="xs"
                        value={columnLayout}
                        onChange={handleColumnLayoutChange}
                        data={[
                          { label: <IconLayoutList size={14} />, value: 'list' },
                          { label: <IconLayoutGrid size={14} />, value: 'grid2' },
                          { label: <IconGridDots size={14} />, value: 'grid3' },
                        ]}
                      />
                    </Group>
                    <Group gap="xs">
                      {isDirty && (
                        <Button
                          leftSection={<IconDeviceFloppy size={16} />}
                          color="teal"
                          size="xs"
                          loading={savePanels.isPending}
                          onClick={() => savePanels.mutate()}
                        >
                          Enregistrer
                        </Button>
                      )}
                      <Button leftSection={<IconPlus size={16} />} variant="light" size="xs" onClick={addPanel}>
                        Ajouter un graphique
                      </Button>
                    </Group>
                  </Group>

                  {panels.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      Aucun graphique dans ce template. Cliquez sur "Ajouter un graphique" pour commencer.
                    </Text>
                  ) : (
                    <SimpleGrid cols={columnLayoutCols[columnLayout]} spacing="md">
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
                        />
                      ))}
                    </SimpleGrid>
                  )}
                </>
              )}
            </>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
