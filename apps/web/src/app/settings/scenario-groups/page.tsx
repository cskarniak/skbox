'use client';

import { Title, Text, Stack, Card, Table, TextInput, Badge, Center, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { DeleteConfirmButton } from '@/components/DeleteConfirmButton';

interface Scenario {
  id: string;
  group: string | null;
}

export default function ScenarioGroupsPage() {
  const queryClient = useQueryClient();
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const { data: scenarios, isLoading } = useQuery<Scenario[]>({
    queryKey: ['scenarios'],
    queryFn: () => api.get('/scenarios').then((r) => r.data),
  });

  const groups = Object.entries(
    (scenarios ?? []).reduce<Record<string, number>>((acc, s) => {
      if (!s.group) return acc;
      acc[s.group] = (acc[s.group] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const renameGroup = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      api.patch(`/scenarios/groups/${encodeURIComponent(oldName)}`, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setEditingGroup(null);
    },
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de renommer.') }),
  });

  const deleteGroup = useMutation({
    mutationFn: (name: string) => api.delete(`/scenarios/groups/${encodeURIComponent(name)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de supprimer.') }),
  });

  const startEditing = (name: string) => {
    setEditingGroup(name);
    setEditingName(name);
  };

  const commitEditing = () => {
    if (!editingGroup) return;
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === editingGroup) {
      setEditingGroup(null);
      return;
    }
    renameGroup.mutate({ oldName: editingGroup, newName: trimmed });
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Groupes de scénarios</Title>
        <Text size="sm" c="dimmed">
          Les scénarios peuvent être regroupés (ex: « Ventilation sous-sol ») pour être repliés ensemble
          dans la liste des scénarios. Renommer un groupe ici le renomme pour tous les scénarios qui
          l&apos;utilisent. Supprimer un groupe ne supprime pas les scénarios, il les détache simplement du
          groupe.
        </Text>
      </div>

      {isLoading ? (
        <Center h={120}>
          <Loader />
        </Center>
      ) : groups.length === 0 ? (
        <Text c="dimmed" size="sm">
          Aucun groupe pour l&apos;instant. Assignez un groupe à un scénario depuis la page Scénarios.
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
              {groups.map((g) => (
                <Table.Tr key={g.name}>
                  <Table.Td>
                    {editingGroup === g.name ? (
                      <TextInput
                        size="xs"
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.currentTarget.value)}
                        onBlur={commitEditing}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEditing();
                          if (e.key === 'Escape') setEditingGroup(null);
                        }}
                      />
                    ) : (
                      <Text size="sm" style={{ cursor: 'pointer' }} onClick={() => startEditing(g.name)}>
                        {g.name}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{g.count}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <DeleteConfirmButton
                      label={`Supprimer le groupe « ${g.name} » ? Les scénarios ne seront pas supprimés.`}
                      loading={deleteGroup.isPending && deleteGroup.variables === g.name}
                      onConfirm={() => deleteGroup.mutate(g.name)}
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
