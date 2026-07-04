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
  Table,
  Switch,
  TextInput,
  NumberInput,
  ActionIcon,
  Center,
  Loader,
} from '@mantine/core';
import {
  IconSmartHome,
  IconScript,
  IconServer,
  IconNetwork,
  IconDatabaseExport,
  IconDownload,
  IconTrash,
  IconRestore,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface BackupFile {
  filename: string;
  mode: 'daily' | 'full';
  sizeBytes: number;
  createdAt: string;
}

interface BackupConfig {
  enabled: boolean;
  cron: string;
  retentionDays: number;
  nextRun: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function BackupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [hostname, setHostname] = useState('localhost');
  const [cron, setCron] = useState('0 3 * * *');
  const [retentionDays, setRetentionDays] = useState(14);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const { data: config } = useQuery<BackupConfig>({
    queryKey: ['backup-config'],
    queryFn: () => api.get('/backup/config').then((r) => r.data),
  });

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setCron(config.cron);
      setRetentionDays(config.retentionDays);
    }
  }, [config]);

  const { data: backups, isLoading: backupsLoading } = useQuery<BackupFile[]>({
    queryKey: ['backups'],
    queryFn: () => api.get('/backup').then((r) => r.data),
    refetchInterval: 15000,
  });

  const saveConfig = useMutation({
    mutationFn: (next: { enabled: boolean; cron: string; retentionDays: number }) =>
      api.put('/backup/config', next).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-config'] });
      notifications.show({ color: 'teal', title: 'Enregistré', message: 'Planification mise à jour' });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec',
        message: error?.response?.data?.message ?? "Impossible d'enregistrer la planification",
      });
    },
  });

  const runBackup = useMutation({
    mutationFn: (mode: 'daily' | 'full') => api.post('/backup/run', { mode }).then((r) => r.data),
    onSuccess: (backup: BackupFile) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      notifications.show({ color: 'teal', title: 'Sauvegarde créée', message: backup.filename });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec de la sauvegarde',
        message: error?.response?.data?.message ?? 'La commande a échoué',
      });
    },
  });

  const restoreBackup = useMutation({
    mutationFn: (filename: string) => api.post('/backup/restore', { filename }).then((r) => r.data),
    onSuccess: (_data, filename) => {
      notifications.show({
        color: 'teal',
        title: 'Restauration terminée',
        message: `${filename} restauré — redémarre les services si nécessaire`,
      });
    },
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec de la restauration',
        message: error?.response?.data?.message ?? 'La commande a échoué',
      });
    },
  });

  const deleteBackup = useMutation({
    mutationFn: (filename: string) => api.delete(`/backup/${filename}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
    onError: (error: any) => {
      notifications.show({
        color: 'red',
        title: 'Échec',
        message: error?.response?.data?.message ?? 'Suppression impossible',
      });
    },
  });

  const handleSaveConfig = () => {
    saveConfig.mutate({ enabled, cron, retentionDays });
  };

  const handleRestore = (filename: string) => {
    if (
      window.confirm(
        `Restaurer "${filename}" ? Ceci va arrêter les services et écraser la DB, les configs Zigbee/RF433 et l'.env actuels (une copie de sécurité sera faite avant).`,
      )
    ) {
      restoreBackup.mutate(filename);
    }
  };

  const handleDelete = (filename: string) => {
    if (window.confirm(`Supprimer définitivement "${filename}" ?`)) {
      deleteBackup.mutate(filename);
    }
  };

  const handleDownload = (filename: string) => {
    window.open(`/api/backup/${filename}/download`, '_blank');
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
            <Tabs
              value="backup"
              onChange={(v) => {
                if (v === 'devices') router.push('/');
                if (v === 'scenarios') router.push('/scenarios');
                if (v === 'system') router.push('/system');
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
          <Title order={4}>Sauvegarde &amp; restauration</Title>

          <Card shadow="sm" padding="lg" withBorder>
            <Text size="sm" c="dimmed" mb="xs">
              Sauvegarde automatique quotidienne
            </Text>
            <Stack gap="sm">
              <Switch
                label="Activée"
                checked={enabled}
                onChange={(e) => setEnabled(e.currentTarget.checked)}
              />
              <TextInput
                label="Expression cron"
                description="Format standard : minute heure jour mois jour-semaine (ex. 0 3 * * * = tous les jours à 3h)"
                value={cron}
                onChange={(e) => setCron(e.currentTarget.value)}
                disabled={!enabled}
              />
              <NumberInput
                label="Rétention (jours)"
                description="Les archives quotidiennes plus anciennes sont supprimées automatiquement"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(v) => setRetentionDays(typeof v === 'number' ? v : 14)}
                disabled={!enabled}
                w={200}
              />
              <Group justify="space-between">
                {config?.nextRun && enabled && (
                  <Text size="xs" c="dimmed">
                    Prochaine exécution : {new Date(config.nextRun).toLocaleString('fr-FR')}
                  </Text>
                )}
                <Button
                  size="sm"
                  loading={saveConfig.isPending}
                  onClick={handleSaveConfig}
                  ml="auto"
                >
                  Enregistrer
                </Button>
              </Group>
            </Stack>
          </Card>

          <Card shadow="sm" padding="lg" withBorder>
            <Text size="sm" c="dimmed" mb="xs">
              Sauvegarde manuelle
            </Text>
            <Group>
              <Button
                variant="light"
                loading={runBackup.isPending && runBackup.variables === 'daily'}
                onClick={() => runBackup.mutate('daily')}
              >
                Sauvegarder maintenant
              </Button>
              <Button
                variant="light"
                color="grape"
                loading={runBackup.isPending && runBackup.variables === 'full'}
                onClick={() => runBackup.mutate('full')}
              >
                Sauvegarde complète (reconstruction)
              </Button>
            </Group>
          </Card>

          <Card shadow="sm" padding="lg" withBorder>
            <Text size="sm" c="dimmed" mb="xs">
              Archives disponibles
            </Text>
            {backupsLoading ? (
              <Center h={100}>
                <Loader size="sm" />
              </Center>
            ) : !backups || backups.length === 0 ? (
              <Text size="sm" c="dimmed">
                Aucune sauvegarde pour le moment
              </Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Fichier</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Taille</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {backups.map((b) => (
                    <Table.Tr key={b.filename}>
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {b.filename}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={b.mode === 'full' ? 'grape' : 'blue'} variant="light">
                          {b.mode === 'full' ? 'complète' : 'quotidienne'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {new Date(b.createdAt).toLocaleString('fr-FR')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {formatSize(b.sizeBytes)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end">
                          <Tooltip label="Télécharger">
                            <ActionIcon variant="subtle" onClick={() => handleDownload(b.filename)}>
                              <IconDownload size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Restaurer">
                            <ActionIcon
                              variant="subtle"
                              color="orange"
                              loading={restoreBackup.isPending && restoreBackup.variables === b.filename}
                              onClick={() => handleRestore(b.filename)}
                            >
                              <IconRestore size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Supprimer">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              loading={deleteBackup.isPending && deleteBackup.variables === b.filename}
                              onClick={() => handleDelete(b.filename)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
