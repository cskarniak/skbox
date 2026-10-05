'use client';

import { Badge, Card, Group, SegmentedControl, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

type OperatingMode = 'summer' | 'away' | 'planning' | 'forced';
type Reason = 'regulation' | 'summer' | 'stale_sensor' | 'emergency_stop';

interface BoilerEvent {
  id: string;
  at: string;
  action: 'ON' | 'OFF';
  reason: Reason;
  operatingMode: OperatingMode;
  level: string | null;
  programName: string | null;
  exceptionName: string | null;
  targetTemp: number | null;
  currentTemp: number | null;
  hysteresis: number | null;
  sensorAgeMinutes: number | null;
  overrideUntil: string | null;
  previousStateMinutes: number | null;
}

const PERIODS = [
  { value: '1', label: '24 h' },
  { value: '7', label: '7 j' },
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
];

const REASONS: Record<Reason, string> = {
  regulation: 'Régulation',
  summer: 'Mode été',
  stale_sensor: 'Sonde périmée',
  emergency_stop: 'Arrêt du module',
};

const MODES: Record<OperatingMode, string> = {
  summer: 'Été',
  away: 'Absent',
  planning: 'Planning',
  forced: 'Forcé',
};

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')}`;
}

function formatTemp(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}°`;
}

export function BoilerEventsCard({ levelLabels }: { levelLabels?: Record<string, string> }) {
  const [period, setPeriod] = useState('7');

  const { data } = useQuery<BoilerEvent[]>({
    queryKey: ['boiler-events', period],
    queryFn: () => api.get('/boiler/events', { params: { days: period, limit: 500 } }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const events = data ?? [];

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed">
          Historique des déclenchements
        </Text>
        <SegmentedControl size="xs" value={period} onChange={setPeriod} data={PERIODS} />
      </Group>
      {events.length === 0 ? (
        <Text size="sm" c="dimmed">
          Aucun déclenchement sur la période.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={820}>
          <Table striped highlightOnHover verticalSpacing={4} fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th>Cause</Table.Th>
                <Table.Th>Mode</Table.Th>
                <Table.Th>Programme</Table.Th>
                <Table.Th>Niveau</Table.Th>
                <Table.Th ta="right">Cible</Table.Th>
                <Table.Th ta="right">Mesurée</Table.Th>
                <Table.Th ta="right">Hystérésis</Table.Th>
                <Table.Th ta="right">État précédent</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {events.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(e.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={e.action === 'ON' ? 'orange' : 'gray'} variant="light">
                      {e.action === 'ON' ? 'Allumée' : 'Éteinte'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {REASONS[e.reason] ?? e.reason}
                    {e.reason === 'stale_sensor' && e.sensorAgeMinutes !== null && ` (${formatDuration(e.sensorAgeMinutes)} sans mesure)`}
                  </Table.Td>
                  <Table.Td>
                    {MODES[e.operatingMode] ?? e.operatingMode}
                    {e.overrideUntil && ` jusqu'à ${new Date(e.overrideUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                  </Table.Td>
                  <Table.Td>
                    {e.programName ?? '—'}
                    {e.exceptionName && ` (période : ${e.exceptionName})`}
                  </Table.Td>
                  <Table.Td>{e.level ? (levelLabels?.[e.level] ?? e.level) : '—'}</Table.Td>
                  <Table.Td ta="right">{formatTemp(e.targetTemp)}</Table.Td>
                  <Table.Td ta="right">{formatTemp(e.currentTemp)}</Table.Td>
                  <Table.Td ta="right">{e.hysteresis === null ? '—' : `±${e.hysteresis.toLocaleString('fr-FR')}`}</Table.Td>
                  <Table.Td ta="right">{formatDuration(e.previousStateMinutes)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}
