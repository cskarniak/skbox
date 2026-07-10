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
  Table,
  Badge,
  Alert,
  Loader,
} from '@mantine/core';
import { IconSmartHome, IconChevronLeft, IconAntenna, IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';
import { formatDateTime } from '@/lib/history';

interface NetworkLink {
  sourceName: string;
  targetName: string;
  linkquality: number;
  weak: boolean;
}

interface NetworkDevice {
  ieeeAddr: string;
  friendlyName: string;
  type: 'Coordinator' | 'Router' | 'EndDevice';
}

interface NetworkHealthReport {
  scannedAt: string;
  devices: NetworkDevice[];
  links: NetworkLink[];
}

export default function NetworkHealthPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useQuery<NetworkHealthReport | null>({
    queryKey: ['network-health'],
    // Un contrôleur qui retourne `null` (aucun scan encore effectué) produit un corps de
    // réponse vide (Content-Length: 0) plutôt que le JSON "null" — axios renvoie alors une
    // chaîne vide, pas `null`. On normalise donc explicitement toute réponse non-objet.
    queryFn: () => api.get('/network-health').then((r) => (r.data && typeof r.data === 'object' ? r.data : null)),
  });

  const scan = useMutation({
    mutationFn: () => api.post('/network-health/scan').then((r) => r.data),
    onSuccess: (data) => queryClient.setQueryData(['network-health'], data),
  });

  const weakCount = report?.links.filter((l) => l.weak).length ?? 0;

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
            <Text size="sm" c="dimmed">Modules</Text>
            <Text size="sm" c="dimmed">/</Text>
            <IconAntenna size={18} />
            <Text size="sm" fw={500}>Santé réseau</Text>
          </Group>

          <Card shadow="sm" padding="lg" withBorder>
            <Group justify="space-between" wrap="wrap">
              <div>
                <Text fw={500}>Maillage Zigbee</Text>
                <Text size="xs" c="dimmed">
                  {report
                    ? `Dernier scan : ${formatDateTime(new Date(report.scannedAt).getTime())}`
                    : "Aucun scan pour l'instant"}
                  {' — '}rafraîchi automatiquement toutes les 30 minutes.
                </Text>
              </div>
              <Button
                size="xs"
                leftSection={<IconRefresh size={14} />}
                loading={scan.isPending}
                onClick={() => scan.mutate()}
              >
                Scanner maintenant
              </Button>
            </Group>
            {scan.isError && (
              <Alert mt="sm" icon={<IconAlertCircle size={16} />} color="red">
                Échec du scan : {(scan.error as any)?.response?.data?.message ?? (scan.error as any)?.message ?? 'erreur inconnue'}
              </Alert>
            )}
          </Card>

          {isLoading && <Loader />}

          {!isLoading && !report && (
            <Alert icon={<IconAlertCircle size={16} />} color="blue">
              Pas encore de relevé disponible — clique sur "Scanner maintenant" pour lancer le premier.
            </Alert>
          )}

          {report && (
            <>
              <Group gap="xs">
                <Badge color="gray" variant="light">{report.devices.length} appareils</Badge>
                <Badge color={weakCount > 0 ? 'orange' : 'teal'} variant="light">
                  {weakCount} liaison{weakCount !== 1 ? 's' : ''} faible{weakCount !== 1 ? 's' : ''}
                </Badge>
              </Group>

              <Card shadow="sm" padding="lg" withBorder>
                <Text fw={500} mb="xs">Liaisons du maillage</Text>
                <Text size="xs" c="dimmed" mb="sm">
                  Qualité de signal (LQI) entre chaque paire d'appareils reliés, du plus faible au plus fort — sur
                  une échelle de 0 à 255. Un lien faible n'est problématique que si l'appareil n'a pas d'autre
                  route disponible vers le coordinateur.
                </Text>
                {report.links.length === 0 ? (
                  <Text size="sm" c="dimmed">Aucune liaison relevée.</Text>
                ) : (
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Depuis</Table.Th>
                        <Table.Th>Vers</Table.Th>
                        <Table.Th>Qualité</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {report.links.map((link, i) => (
                        <Table.Tr key={i}>
                          <Table.Td>{link.sourceName}</Table.Td>
                          <Table.Td>{link.targetName}</Table.Td>
                          <Table.Td>
                            <Badge color={link.weak ? 'orange' : 'teal'} variant="light">
                              {link.linkquality}/255
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </Card>
            </>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
