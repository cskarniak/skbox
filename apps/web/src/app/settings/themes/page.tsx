'use client';

import { Title, Text, Stack, Card, Table, TextInput, Button, Group, Badge } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { DeleteConfirmButton } from '@/components/DeleteConfirmButton';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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

  const renameTheme = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/themes/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themes'] });
      setEditingId(null);
    },
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de renommer.') }),
  });

  const deleteTheme = useMutation({
    mutationFn: (id: string) => api.delete(`/themes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['themes'] }),
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de supprimer.') }),
  });

  const startEditing = (theme: Theme) => {
    setEditingId(theme.id);
    setEditingName(theme.name);
  };

  const commitEditing = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    renameTheme.mutate({ id: editingId, name: trimmed });
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Thèmes</Title>
        <Text size="sm" c="dimmed">
          Groupes libres d&apos;appareils utilisés pour organiser les sections du dashboard, indépendants
          des pièces.
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
                <Table.Td>
                  {editingId === theme.id ? (
                    <TextInput
                      size="xs"
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.currentTarget.value)}
                      onBlur={commitEditing}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditing();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <Text
                      size="sm"
                      style={{ cursor: 'pointer' }}
                      onClick={() => startEditing(theme)}
                    >
                      {theme.name}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{theme.devices.length}</Badge>
                </Table.Td>
                <Table.Td>
                  <DeleteConfirmButton
                    label={`Supprimer le thème « ${theme.name} » ?`}
                    loading={deleteTheme.isPending && deleteTheme.variables === theme.id}
                    onConfirm={() => deleteTheme.mutate(theme.id)}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
