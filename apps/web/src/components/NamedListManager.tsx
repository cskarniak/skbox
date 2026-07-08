'use client';

import { ActionIcon, Group, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { DeleteConfirmButton } from '@/components/DeleteConfirmButton';

interface NamedListItem {
  id: string;
  name: string;
  icon: string | null;
  order: number;
}

export function NamedListManager({
  title,
  description,
  queryKey,
  endpoint,
}: {
  title: string;
  description: string;
  queryKey: string;
  endpoint: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const { data: items } = useQuery<NamedListItem[]>({
    queryKey: [queryKey],
    queryFn: () => api.get(endpoint).then((r) => r.data),
  });

  const createItem = useMutation({
    mutationFn: () => api.post(endpoint, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setName('');
    },
  });

  const renameItem = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`${endpoint}/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setEditingId(null);
    },
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de renommer.') }),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
    onError: (err) => notifications.show({ color: 'red', message: errorMessage(err, 'Impossible de supprimer.') }),
  });

  const startEditing = (item: NamedListItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const commitEditing = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    renameItem.mutate({ id: editingId, name: trimmed });
  };

  return (
    <Stack gap="xs" style={{ flex: 1 }}>
      <div>
        <Text fw={500} size="sm">
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      </div>
      <Group gap="xs">
        <TextInput
          size="xs"
          placeholder="Nom"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <ActionIcon
          variant="light"
          disabled={!name.trim()}
          loading={createItem.isPending}
          onClick={() => createItem.mutate()}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      <Table striped highlightOnHover verticalSpacing={4} fz="xs">
        <Table.Tbody>
          {(items ?? []).map((item) => (
            <Table.Tr key={item.id}>
              <Table.Td>
                {editingId === item.id ? (
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
                  <Text size="xs" style={{ cursor: 'pointer' }} onClick={() => startEditing(item)}>
                    {item.name}
                  </Text>
                )}
              </Table.Td>
              <Table.Td w={28}>
                <DeleteConfirmButton
                  size="xs"
                  label={`Supprimer « ${item.name} » ?`}
                  loading={deleteItem.isPending && deleteItem.variables === item.id}
                  onConfirm={() => deleteItem.mutate(item.id)}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
