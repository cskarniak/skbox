'use client';

import { Title, Text, Stack, Card, Table, TextInput, Button, Group, Badge } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { DeleteConfirmButton } from '@/components/DeleteConfirmButton';

interface ScenarioGroup {
  id: string;
  name: string;
  scenarioCount: number;
}

export default function ScenarioGroupsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const { data: groups } = useQuery<ScenarioGroup[]>({
    queryKey: ['scenario-groups'],
    queryFn: () => api.get('/scenario-groups').then((r) => r.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['scenario-groups'] });
    queryClient.invalidateQueries({ queryKey: ['scenarios'] });
  };

  const createGroup = useMutation({
    mutationFn: () => api.post('/scenario-groups', { name }),
    onSuccess: () => {
      invalidate();
      setName('');
    },
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de créer.') }),
  });

  const renameGroup = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/scenario-groups/${id}`, { name }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de renommer.') }),
  });

  const deleteGroup = useMutation({
    mutationFn: (id: string) => api.delete(`/scenario-groups/${id}`),
    onSuccess: () => invalidate(),
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de supprimer.') }),
  });

  const startEditing = (group: ScenarioGroup) => {
    setEditingId(group.id);
    setEditingName(group.name);
  };

  const commitEditing = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    renameGroup.mutate({ id: editingId, name: trimmed });
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Groupes de scénarios</Title>
        <Text size="sm" c="dimmed">
          Les scénarios peuvent être regroupés (ex: « Ventilation sous-sol ») pour être repliés ensemble
          dans la liste des scénarios. Créez un groupe ici puis assignez-le à un scénario depuis son champ
          « Groupe ».
        </Text>
      </div>

      <Card shadow="sm" padding="lg" withBorder>
        <Group>
          <TextInput
            placeholder="Nom du groupe (ex: Ventilation sous-sol)"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            w={300}
          />
          <Button
            leftSection={<IconPlus size={16} />}
            disabled={!name.trim()}
            loading={createGroup.isPending}
            onClick={() => createGroup.mutate()}
          >
            Ajouter
          </Button>
        </Group>
      </Card>

      {(groups ?? []).length === 0 ? (
        <Text c="dimmed" size="sm">
          Aucun groupe pour l&apos;instant.
        </Text>
      ) : (
        <Card shadow="sm" padding="lg" withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nom</Table.Th>
                <Table.Th>Scénarios</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(groups ?? []).map((g) => (
                <Table.Tr key={g.id}>
                  <Table.Td>
                    {editingId === g.id ? (
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
                      <Text size="sm" style={{ cursor: 'pointer' }} onClick={() => startEditing(g)}>
                        {g.name}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{g.scenarioCount}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <DeleteConfirmButton
                      label={`Supprimer le groupe « ${g.name} » ?`}
                      loading={deleteGroup.isPending && deleteGroup.variables === g.id}
                      onConfirm={() => deleteGroup.mutate(g.id)}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </Stack>
  );
}
