'use client';

import { Badge, Card, Group, SegmentedControl, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

interface PowerOutage {
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  ongoing: boolean;
  status: 'confirmed' | 'unverified' | 'pending';
  devicesOffline: string[];
}

interface PowerOutageHistory {
  deviceId: string | null;
  deviceName: string | null;
  minDurationMinutes: number;
  totalMinutes: number;
  discardedParasites: number;
  trackingSince: string | null;
  outages: PowerOutage[];
}

const PERIODS = [
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
  { value: '365', label: '1 an' },
];

function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${total} min` : `${h} h ${String(m).padStart(2, '0')}`;
}

function StatusBadge({ outage }: { outage: PowerOutage }) {
  if (outage.status === 'confirmed') {
    return (
      <Badge size="sm" color="teal" variant="light">
        Confirmée
      </Badge>
    );
  }
  if (outage.status === 'pending') {
    return (
      <Badge size="sm" color="orange" variant="light">
        À confirmer
      </Badge>
    );
  }
  return (
    <Badge size="sm" color="gray" variant="light">
      Non vérifiée
    </Badge>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function OutagesCard() {
  const [period, setPeriod] = useState('90');

  const { data } = useQuery<PowerOutageHistory>({
    queryKey: ['energy-outages', period],
    queryFn: () => api.get('/energy/outages', { params: { days: period } }).then((r) => r.data),
    refetchInterval: 60000,
  });

  if (!data?.deviceId) return null;

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed">
          Coupures de courant
        </Text>
        <SegmentedControl size="xs" value={period} onChange={setPeriod} data={PERIODS} />
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Le compteur « {data.deviceName} » indique 0 W et des appareils branchés sur le secteur deviennent muets en même temps
        {data.outages.length > 0 &&
          ` · ${data.outages.length} coupure${data.outages.length > 1 ? 's' : ''}, ${formatDuration(data.totalMinutes)} au total`}
        {data.discardedParasites > 0 &&
          ` · ${data.discardedParasites} relevé${data.discardedParasites > 1 ? 's' : ''} à 0 W écarté${data.discardedParasites > 1 ? 's' : ''} (parasites)`}
      </Text>
      {data.trackingSince && (
        <Text size="xs" c="dimmed" mb="sm">
          Vérification par les appareils active depuis le {new Date(data.trackingSince).toLocaleDateString('fr-FR')} ; avant, les coupures
          de plus de {data.minDurationMinutes} min sont listées « non vérifiées ».
        </Text>
      )}
      {data.outages.length === 0 ? (
        <Text size="sm" c="dimmed">
          Aucune coupure sur la période.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover verticalSpacing={4} fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Début</Table.Th>
                <Table.Th>Retour du courant</Table.Th>
                <Table.Th ta="right">Durée</Table.Th>
                <Table.Th>Statut</Table.Th>
                <Table.Th>Appareils hors ligne</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.outages.map((o) => (
                <Table.Tr key={o.startedAt}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(o.startedAt)}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {o.ongoing ? (
                      <Badge size="sm" color="red" variant="filled">
                        En cours
                      </Badge>
                    ) : (
                      o.endedAt && formatDateTime(o.endedAt)
                    )}
                  </Table.Td>
                  <Table.Td ta="right">{formatDuration(o.durationMinutes)}</Table.Td>
                  <Table.Td>
                    <StatusBadge outage={o} />
                  </Table.Td>
                  <Table.Td>{o.devicesOffline.length > 0 ? o.devicesOffline.join(', ') : '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}
