'use client';

import { Title, Text, Stack, Card, TextInput, Table, ScrollArea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

interface MqttLogEntry {
  topic: string;
  payload: string;
  timestamp: number;
}

export default function SettingsMqttLogsPage() {
  const [topic, setTopic] = useState('');

  const { data: logs } = useQuery<MqttLogEntry[]>({
    queryKey: ['mqtt-logs', topic],
    queryFn: () => api.get('/mqtt/logs', { params: topic ? { topic } : {} }).then((r) => r.data),
    refetchInterval: 2000,
  });

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Logs MQTT</Title>
        <Text size="sm" c="dimmed">
          Derniers messages reçus par le broker (buffer en mémoire, 500 messages max). Filtre par topic avec
          les wildcards MQTT (ex: <code>zigbee2mqtt/#</code>, <code>+/bridge/state</code>).
        </Text>
      </div>

      <Card shadow="sm" padding="lg" withBorder>
        <TextInput
          label="Filtre topic"
          placeholder="zigbee2mqtt/#"
          value={topic}
          onChange={(e) => setTopic(e.currentTarget.value)}
          mb="md"
        />

        <ScrollArea h={500}>
          <Table striped highlightOnHover fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={100}>Heure</Table.Th>
                <Table.Th w={280}>Topic</Table.Th>
                <Table.Th>Payload</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(logs ?? []).map((entry, i) => (
                <Table.Tr key={`${entry.timestamp}-${i}`}>
                  <Table.Td>{new Date(entry.timestamp).toLocaleTimeString('fr-FR')}</Table.Td>
                  <Table.Td ff="monospace">{entry.topic}</Table.Td>
                  <Table.Td ff="monospace" style={{ wordBreak: 'break-all' }}>
                    {entry.payload}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>
    </Stack>
  );
}
