'use client';

import { Card, Group, Progress, SegmentedControl, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

interface DailyHeating {
  date: string;
  minutes: number;
  cycles: number;
}

interface HeatingHistory {
  deviceId: string | null;
  days: DailyHeating[];
}

const PERIODS = [
  { value: '7', label: '7 j' },
  { value: '14', label: '14 j' },
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
];

function formatDuration(minutes: number): string {
  if (minutes === 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function HeatingHistoryCard() {
  const [period, setPeriod] = useState('14');

  const { data } = useQuery<HeatingHistory>({
    queryKey: ['boiler-heating', period],
    queryFn: () => api.get('/boiler/heating', { params: { days: period } }).then((r) => r.data),
    refetchInterval: 60000,
  });

  if (!data?.deviceId) return null;

  // Du plus récent au plus ancien : c'est le jour en cours qu'on veut voir en premier.
  const days = [...data.days].reverse();
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  const max = Math.max(...days.map((d) => d.minutes), 1);
  const average = Math.round(total / Math.max(days.length, 1));

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed">
          Temps de chauffe par jour
        </Text>
        <SegmentedControl size="xs" value={period} onChange={setPeriod} data={PERIODS} />
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Total {formatDuration(total)} · moyenne {formatDuration(average)} / jour
      </Text>
      <Stack gap={6}>
        {days.map((d) => (
          <Group key={d.date} gap="sm" wrap="nowrap">
            <Text size="xs" w={78} style={{ flexShrink: 0 }}>
              {formatDay(d.date)}
            </Text>
            <Progress value={(d.minutes / max) * 100} color="orange" size="md" style={{ flex: 1 }} />
            <Text size="xs" w={62} ta="right" style={{ flexShrink: 0 }}>
              {formatDuration(d.minutes)}
            </Text>
            <Text size="xs" c="dimmed" w={44} ta="right" style={{ flexShrink: 0 }}>
              {d.cycles} cyc.
            </Text>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
