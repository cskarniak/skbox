'use client';

import { Card, Group, Progress, SegmentedControl, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

interface DailyEnergy {
  date: string;
  kwh: number;
  peakW: number | null;
}

interface ElectricityHistory {
  deviceId: string | null;
  deviceName: string | null;
  currentPowerW: number | null;
  days: DailyEnergy[];
}

const PERIODS = [
  { value: '7', label: '7 j' },
  { value: '14', label: '14 j' },
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
];

// Échelle fixe : une barre pleine = 24 kWh dans la journée (comparable d'un jour et d'une période à
// l'autre, contrairement à une échelle ramenée au jour le plus consommateur).
const FULL_SCALE_KWH = 24;

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function formatKwh(kwh: number): string {
  return `${kwh.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
}

export function ElectricityCard() {
  const [period, setPeriod] = useState('14');

  const { data } = useQuery<ElectricityHistory>({
    queryKey: ['energy-electricity', period],
    queryFn: () => api.get('/energy/electricity', { params: { days: period } }).then((r) => r.data),
    refetchInterval: 60000,
  });

  if (!data) return null;

  if (!data.deviceId) {
    return (
      <Card shadow="sm" padding="lg" withBorder>
        <Text size="sm" c="dimmed">
          Consommation électrique par jour
        </Text>
        <Text size="sm" mt="xs">
          Aucun compteur électrique trouvé (capteur de puissance avec compteur d'énergie).
        </Text>
      </Card>
    );
  }

  // Du plus récent au plus ancien, comme le temps de chauffe.
  const days = [...data.days].reverse();
  const total = days.reduce((sum, d) => sum + d.kwh, 0);
  const average = total / Math.max(days.length, 1);

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed">
          Consommation électrique par jour
        </Text>
        <SegmentedControl size="xs" value={period} onChange={setPeriod} data={PERIODS} />
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Total {formatKwh(total)} · moyenne {formatKwh(average)} / jour · barre pleine = {FULL_SCALE_KWH} kWh
        {data.currentPowerW !== null && ` · puissance actuelle ${data.currentPowerW} W`}
      </Text>
      <Stack gap={6}>
        {days.map((d) => (
          <Group key={d.date} gap="sm" wrap="nowrap">
            <Text size="xs" w={78} style={{ flexShrink: 0 }}>
              {formatDay(d.date)}
            </Text>
            <Progress value={Math.min(100, (d.kwh / FULL_SCALE_KWH) * 100)} color="yellow" size="md" style={{ flex: 1 }} />
            <Text size="xs" w={74} ta="right" style={{ flexShrink: 0 }}>
              {formatKwh(d.kwh)}
            </Text>
            <Text size="xs" c="dimmed" w={64} ta="right" style={{ flexShrink: 0 }}>
              {d.peakW !== null ? `pic ${d.peakW} W` : '—'}
            </Text>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
