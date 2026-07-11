'use client';

import { Card, Title, Text, Stack, Button, Table, Group, Badge, Loader, Center, Popover, Spoiler } from '@mantine/core';
import { IconSearch, IconTrash, IconPlayerPlay, IconPlayerStop, IconTestPipe } from '@tabler/icons-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

interface OptimizeResult {
  deviceId: string;
  name: string;
  total: number;
  redundant: number;
  kept: number;
  dryRun: boolean;
}

interface SystemHealth {
  tailscale: {
    connected: boolean;
    backendState: string | null;
    ips: string[];
  };
}

interface TestRunResult {
  success: boolean;
  summary: string;
  output: string;
  durationMs: number;
}

function ConfirmButton({
  label,
  message,
  onConfirm,
  loading,
  disabled,
  icon = <IconTrash size={16} />,
}: {
  label: string;
  message: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onClose={() => setOpened(false)} position="bottom-start" withArrow>
      <Popover.Target>
        <Button
          leftSection={icon}
          color="red"
          variant="light"
          size="sm"
          loading={loading}
          disabled={disabled}
          onClick={() => setOpened((o) => !o)}
        >
          {label}
        </Button>
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

export default function ToolsPage() {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<OptimizeResult[] | null>(null);

  const { data: health } = useQuery<SystemHealth>({
    queryKey: ['system-health'],
    queryFn: () => api.get('/system/health').then((r) => r.data),
    refetchInterval: 10000,
  });

  const startTailscale = useMutation({
    mutationFn: () => api.post('/system/tailscale/start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      notifications.show({ color: 'teal', message: 'tailscaled démarré.' });
    },
    onError: (err) =>
      notifications.show({ color: 'red', title: 'Échec', message: errorMessage(err, 'Impossible de démarrer tailscaled.') }),
  });

  const stopTailscale = useMutation({
    mutationFn: () => api.post('/system/tailscale/stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      notifications.show({ color: 'teal', message: 'tailscaled arrêté.' });
    },
    onError: (err) =>
      notifications.show({ color: 'red', title: 'Échec', message: errorMessage(err, 'Impossible d\'arrêter tailscaled.') }),
  });

  const tailscaleActionPending = startTailscale.isPending || stopTailscale.isPending;

  const analyze = useMutation({
    mutationFn: () => api.post<OptimizeResult[]>('/devices/optimize-history?dryRun=true').then((r) => r.data),
    onSuccess: (data) => setResults(data),
    onError: () => {
      notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'analyser les historiques." });
    },
  });

  const optimize = useMutation({
    mutationFn: () => api.post<OptimizeResult[]>('/devices/optimize-history').then((r) => r.data),
    onSuccess: (data) => {
      setResults(data);
      const totalDeleted = data.reduce((sum, r) => sum + r.redundant, 0);
      notifications.show({
        color: 'teal',
        title: 'Optimisation terminée',
        message: `${totalDeleted} entrée(s) redondante(s) supprimée(s).`,
      });
    },
    onError: () => {
      notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'optimiser les historiques." });
    },
  });

  const totalRedundant = results?.reduce((sum, r) => sum + r.redundant, 0) ?? 0;

  const runTests = useMutation({
    mutationFn: () => api.post<TestRunResult>('/system/run-tests').then((r) => r.data),
    onSuccess: (data) => {
      notifications.show({
        color: data.success ? 'teal' : 'red',
        title: data.success ? 'Tests réussis' : 'Échec des tests',
        message: data.summary || `Terminé en ${(data.durationMs / 1000).toFixed(1)} s`,
      });
    },
    onError: (err) =>
      notifications.show({ color: 'red', title: 'Échec', message: errorMessage(err, "Impossible de lancer les tests.") }),
  });

  return (
    <Stack gap="lg">
      <Card shadow="sm" padding="lg" withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>Tailscale (accès distant)</Title>
            <Text size="sm" c="dimmed">
              Démarre ou arrête le service <code>tailscaled</code> sur le serveur. L&apos;arrêter coupe
              l&apos;accès distant à Skbox tant qu&apos;il n&apos;est pas relancé.
            </Text>
          </div>

          <Group gap="sm">
            <Badge color={health?.tailscale.connected ? 'teal' : 'red'} variant="light">
              {health?.tailscale.connected ? 'Connecté' : (health?.tailscale.backendState ?? 'Arrêté')}
            </Badge>
            {health && health.tailscale.ips.length > 0 && (
              <Text size="xs" c="dimmed" ff="monospace">
                {health.tailscale.ips.join(', ')}
              </Text>
            )}
          </Group>

          <Group gap="sm">
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              variant="light"
              color="teal"
              onClick={() => startTailscale.mutate()}
              loading={startTailscale.isPending}
              disabled={tailscaleActionPending || !!health?.tailscale.connected}
            >
              Démarrer
            </Button>
            <ConfirmButton
              label="Arrêter"
              message="Arrêter le service tailscaled ? L'accès distant sera coupé jusqu'au redémarrage."
              onConfirm={() => stopTailscale.mutate()}
              loading={stopTailscale.isPending}
              disabled={tailscaleActionPending || !health?.tailscale.connected}
              icon={<IconPlayerStop size={16} />}
            />
          </Group>
        </Stack>
      </Card>

      <Card shadow="sm" padding="lg" withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>Optimiser les historiques</Title>
            <Text size="sm" c="dimmed">
              Parcourt l&apos;historique de chaque appareil historisé et ne garde que les événements qui
              correspondent à un vrai changement de valeur (même règle que celle appliquée à l&apos;enregistrement :
              les champs comme la qualité de liaison sont ignorés, et les valeurs identiques consécutives sont
              supprimées). Le premier et le dernier événement de chaque série de valeurs identiques sont toujours
              conservés.
            </Text>
          </div>

          <Group gap="sm">
            <Button
              leftSection={<IconSearch size={16} />}
              variant="light"
              onClick={() => analyze.mutate()}
              loading={analyze.isPending}
            >
              Analyser
            </Button>
            <ConfirmButton
              label="Optimiser"
              message={
                totalRedundant > 0
                  ? `Supprimer ${totalRedundant} entrée(s) redondante(s) ? Cette action est irréversible.`
                  : 'Lancer l\'optimisation ?'
              }
              onConfirm={() => optimize.mutate()}
              loading={optimize.isPending}
              disabled={!results}
            />
          </Group>

          {analyze.isPending ? (
            <Center h={100}>
              <Loader size="sm" />
            </Center>
          ) : results && results.length === 0 ? (
            <Text size="sm" c="dimmed">
              Aucun appareil n&apos;est historisé.
            </Text>
          ) : results ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Appareil</Table.Th>
                  <Table.Th>Total</Table.Th>
                  <Table.Th>Redondant</Table.Th>
                  <Table.Th>Conservé</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {results.map((r) => (
                  <Table.Tr key={r.deviceId}>
                    <Table.Td>{r.name}</Table.Td>
                    <Table.Td>{r.total}</Table.Td>
                    <Table.Td>
                      {r.redundant > 0 ? (
                        <Badge color="orange" variant="light">
                          {r.redundant}
                        </Badge>
                      ) : (
                        r.redundant
                      )}
                    </Table.Td>
                    <Table.Td>{r.kept}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : null}
        </Stack>
      </Card>

      <Card shadow="sm" padding="lg" withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>Tests automatisés</Title>
            <Text size="sm" c="dimmed">
              Lance la suite de tests unitaires du moteur de chaudière et de scénarios (<code>pnpm --filter api test</code>)
              directement depuis le serveur, sans rien exécuter sur les appareils réels.
            </Text>
          </div>

          <Group gap="sm">
            <Button
              leftSection={<IconTestPipe size={16} />}
              variant="light"
              onClick={() => runTests.mutate()}
              loading={runTests.isPending}
            >
              Lancer les tests
            </Button>
            {runTests.data && (
              <>
                <Badge color={runTests.data.success ? 'teal' : 'red'} variant="light">
                  {runTests.data.success ? 'Succès' : 'Échec'}
                </Badge>
                <Text size="sm" c="dimmed">
                  {runTests.data.summary} · {(runTests.data.durationMs / 1000).toFixed(1)} s
                </Text>
              </>
            )}
          </Group>

          {runTests.isPending ? (
            <Center h={80}>
              <Loader size="sm" />
            </Center>
          ) : runTests.data ? (
            <Spoiler maxHeight={160} showLabel="Voir le détail complet" hideLabel="Réduire">
              <Text component="pre" size="xs" ff="monospace" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {runTests.data.output}
              </Text>
            </Spoiler>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
