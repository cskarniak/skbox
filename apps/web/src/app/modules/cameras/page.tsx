'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Stack,
  Button,
  Card,
  ActionIcon,
  Select,
  TextInput,
  PasswordInput,
  SimpleGrid,
  Center,
  Modal,
  Popover,
} from '@mantine/core';
import { IconSmartHome, IconChevronLeft, IconPlus, IconTrash, IconEdit, IconVideoOff } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';

interface Camera {
  id: string;
  name: string;
  room: string | null;
  active: boolean;
  order: number;
}

interface RoomItem {
  id: string;
  name: string;
}

function useGo2rtcHost() {
  const [host, setHost] = useState('localhost');
  useEffect(() => {
    setHost(window.location.hostname);
  }, []);
  return host;
}

function ConfirmDeleteButton({ message, onConfirm }: { message: string; onConfirm: () => void }) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onClose={() => setOpened(false)} position="bottom-end" withArrow>
      <Popover.Target>
        <ActionIcon variant="subtle" color="red" onClick={() => setOpened((o) => !o)}>
          <IconTrash size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm">{message}</Text>
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="subtle" onClick={() => setOpened(false)}>
              Non
            </Button>
            <Button
              size="xs"
              color="red"
              onClick={() => {
                setOpened(false);
                onConfirm();
              }}
            >
              Oui
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function CameraFormModal({
  opened,
  onClose,
  rooms,
  initial,
  onSubmit,
  submitting,
}: {
  opened: boolean;
  onClose: () => void;
  rooms: RoomItem[];
  initial?: { name: string; room: string | null };
  onSubmit: (data: { name: string; room: string | null; rtspUrl: string }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [room, setRoom] = useState<string | null>(initial?.room ?? null);
  const [rtspUrl, setRtspUrl] = useState('');

  return (
    <Modal opened={opened} onClose={onClose} title={initial ? 'Modifier la caméra' : 'Nouvelle caméra'}>
      <Stack gap="sm">
        <TextInput label="Nom" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Select
          label="Pièce"
          data={rooms.map((r) => ({ value: r.name, label: r.name }))}
          value={room}
          onChange={setRoom}
          clearable
          searchable
        />
        <PasswordInput
          label="URL RTSP"
          description="Identifiants inclus, ex. rtsp://user:motdepasse@192.168.1.x:554/chemin"
          value={rtspUrl}
          onChange={(e) => setRtspUrl(e.currentTarget.value)}
          placeholder={initial ? 'Laisser vide pour ne pas modifier' : undefined}
          required={!initial}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={submitting}
            disabled={!name.trim() || (!initial && !rtspUrl.trim())}
            onClick={() => onSubmit({ name: name.trim(), room, rtspUrl: rtspUrl.trim() })}
          >
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function CameraTile({ camera, host, onEdit, onRemove }: { camera: Camera; host: string; onEdit: () => void; onRemove: () => void }) {
  const [expanded, { open: expand, close: collapse }] = useDisclosure(false);
  const streamSrc = `http://${host}:1984/stream.html?src=${encodeURIComponent(camera.id)}`;

  return (
    <>
      <Card shadow="sm" padding="lg" withBorder>
        <Group justify="space-between" mb="xs">
          <div>
            <Text fw={500}>{camera.name}</Text>
            {camera.room && (
              <Text size="xs" c="dimmed">
                {camera.room}
              </Text>
            )}
          </div>
          <Group gap={4}>
            <ActionIcon variant="subtle" onClick={onEdit}>
              <IconEdit size={16} />
            </ActionIcon>
            <ConfirmDeleteButton message="Supprimer cette caméra ?" onConfirm={onRemove} />
          </Group>
        </Group>
        {camera.active ? (
          <div
            style={{ cursor: 'pointer', aspectRatio: '16/9', overflow: 'hidden', borderRadius: 'var(--mantine-radius-sm)' }}
            onClick={expand}
          >
            <iframe
              src={streamSrc}
              style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
              allow="autoplay"
            />
          </div>
        ) : (
          <Center h={180} style={{ opacity: 0.5 }}>
            <Stack align="center" gap={4}>
              <IconVideoOff size={28} />
              <Text size="sm">Caméra désactivée</Text>
            </Stack>
          </Center>
        )}
      </Card>

      <Modal opened={expanded} onClose={collapse} title={camera.name} size="xl">
        <div style={{ aspectRatio: '16/9' }}>
          <iframe src={streamSrc} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay" />
        </div>
      </Modal>
    </>
  );
}

export default function CamerasModulePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const host = useGo2rtcHost();
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);

  const { data: cameras, isLoading } = useQuery<Camera[]>({
    queryKey: ['cameras'],
    queryFn: () => api.get('/cameras').then((r) => r.data),
  });

  const { data: rooms } = useQuery<RoomItem[]>({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms').then((r) => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cameras'] });

  const createCamera = useMutation({
    mutationFn: (data: { name: string; room: string | null; rtspUrl: string }) => api.post('/cameras', data),
    onSuccess: () => {
      invalidate();
      closeForm();
      notifications.show({ color: 'teal', title: 'Caméra ajoutée', message: '' });
    },
    onError: () => notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'ajouter la caméra" }),
  });

  const updateCamera = useMutation({
    mutationFn: (data: { id: string; name: string; room: string | null; rtspUrl: string }) => {
      const { id, rtspUrl, ...rest } = data;
      return api.patch(`/cameras/${id}`, rtspUrl ? { ...rest, rtspUrl } : rest);
    },
    onSuccess: () => {
      invalidate();
      closeForm();
      setEditingCamera(null);
      notifications.show({ color: 'teal', title: 'Caméra modifiée', message: '' });
    },
    onError: () => notifications.show({ color: 'red', title: 'Échec', message: 'Impossible de modifier la caméra' }),
  });

  const removeCamera = useMutation({
    mutationFn: (id: string) => api.delete(`/cameras/${id}`),
    onSuccess: invalidate,
    onError: () => notifications.show({ color: 'red', title: 'Échec', message: 'Impossible de supprimer la caméra' }),
  });

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconSmartHome size={28} />
            <Title order={3} visibleFrom="sm">Skbox</Title>
          </Group>
          <Group gap="md" wrap="nowrap">
            <AppNav active="modules" />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="lg">
          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={() => router.push('/modules')}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Text size="sm" c="dimmed">
              Modules
            </Text>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Text size="sm">Caméras</Text>
          </Group>

          <Group justify="space-between">
            <Title order={4}>Caméras</Title>
            <Button
              leftSection={<IconPlus size={16} />}
              size="xs"
              onClick={() => {
                setEditingCamera(null);
                openForm();
              }}
            >
              Ajouter
            </Button>
          </Group>

          {isLoading ? (
            <Center h={200}>
              <Text size="sm" c="dimmed">
                Chargement…
              </Text>
            </Center>
          ) : !cameras || cameras.length === 0 ? (
            <Text size="sm" c="dimmed">
              Aucune caméra. Cliquez sur "Ajouter" pour en configurer une.
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {cameras.map((camera) => (
                <CameraTile
                  key={camera.id}
                  camera={camera}
                  host={host}
                  onEdit={() => {
                    setEditingCamera(camera);
                    openForm();
                  }}
                  onRemove={() => removeCamera.mutate(camera.id)}
                />
              ))}
            </SimpleGrid>
          )}
        </Stack>
      </AppShell.Main>

      <CameraFormModal
        opened={formOpened}
        onClose={() => {
          closeForm();
          setEditingCamera(null);
        }}
        rooms={rooms ?? []}
        initial={editingCamera ? { name: editingCamera.name, room: editingCamera.room } : undefined}
        submitting={createCamera.isPending || updateCamera.isPending}
        onSubmit={(data) => {
          if (editingCamera) {
            updateCamera.mutate({ id: editingCamera.id, ...data });
          } else {
            createCamera.mutate(data);
          }
        }}
      />
    </AppShell>
  );
}
