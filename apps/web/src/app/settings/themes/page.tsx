'use client';

import { Title, Text, Stack, Card, Table, TextInput, Button, Group, ActionIcon, Badge } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

interface Theme {
  id: string;
  name: string;
  icon: string | null;
  order: number;
  devices: { id: string }[];
}

export default function SettingsThemesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const { data: themes } = useQuery<Theme[]>({
    queryKey: ['themes'],
    queryFn: () => api.get('/themes').then((r) => r.data),
  });

  const createTheme = useMutation({
    mutationFn: () => api.post('/themes', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themes'] });
      setName('');
    },
  });

  const deleteTheme = useMutation({
    mutationFn: (id: string) => api.delete(`/themes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['themes'] }),
  });

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Thèmes</Title>
        <Text size="sm" c="dimmed">
          Groupes libres d'appareils utilisés pour organiser les sections du dashboard, indépendants des
          pièces. L'assignation des appareils à un thème se fait depuis l'onglet Appareils.
        </Text>
      </div>

      <Card shadow="sm" padding="lg" withBorder>
        <Group>
          <TextInput
            placeholder="Nom du thème (ex: Éclairage)"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            w={300}
          />
          <Button
            leftSection={<IconPlus size={16} />}
            disabled={!name.trim()}
            loading={createTheme.isPending}
            onClick={() => createTheme.mutate()}
          >
            Ajouter
          </Button>
        </Group>
      </Card>

      <Card shadow="sm" padding="lg" withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nom</Table.Th>
              <Table.Th>Appareils</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(themes ?? []).map((theme) => (
              <Table.Tr key={theme.id}>
                <Table.Td>{theme.name}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{theme.devices.length}</Badge>
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    loading={deleteTheme.isPending && deleteTheme.variables === theme.id}
                    onClick={() => deleteTheme.mutate(theme.id)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
