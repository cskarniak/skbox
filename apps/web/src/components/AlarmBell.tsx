'use client';

import { ActionIcon, Button, Divider, Group, Indicator, Popover, Stack, Text } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

interface AlarmEvent {
  id: string;
  triggeredAt: string;
  scenario: { name: string; severity: 'critical' | 'warning' | null };
}

// Centre de messages : compte les alarmes non acquittées (résolues ou non) et permet
// de les acquitter directement depuis n'importe quelle page, sans passer par /modules/alarms.
export function AlarmBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState(false);

  const { data } = useQuery<AlarmEvent[]>({
    queryKey: ['alarm-events', 'unread'],
    queryFn: () => api.get('/scenarios/alarm-events', { params: { acknowledged: false } }).then((r) => r.data),
    refetchInterval: 10000,
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.post(`/scenarios/alarm-events/${id}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarm-events'] }),
  });

  const unread = data ?? [];

  return (
    <Popover opened={opened} onChange={setOpened} width={320} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Indicator label={unread.length} size={16} color="red" disabled={unread.length === 0} offset={4}>
          <ActionIcon variant="subtle" onClick={() => setOpened((o) => !o)} title="Messages">
            <IconBell size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={500}>Messages</Text>
          {!unread.length ? (
            <Text size="sm" c="dimmed">Aucun message non lu</Text>
          ) : (
            unread.map((ev) => (
              <Group key={ev.id} justify="space-between" wrap="nowrap" gap="xs">
                <div>
                  <Text size="sm" fw={500}>{ev.scenario.name}</Text>
                  <Text size="xs" c="dimmed">{new Date(ev.triggeredAt).toLocaleString('fr-FR')}</Text>
                </div>
                <Button
                  size="xs"
                  variant="light"
                  color={ev.scenario.severity === 'critical' ? 'red' : 'orange'}
                  onClick={() => acknowledge.mutate(ev.id)}
                  loading={acknowledge.isPending}
                >
                  OK
                </Button>
              </Group>
            ))
          )}
          <Divider />
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              setOpened(false);
              router.push('/modules/alarms');
            }}
          >
            Voir toutes les alarmes
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
