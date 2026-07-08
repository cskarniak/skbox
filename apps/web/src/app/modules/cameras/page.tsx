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
  Slider,
  Divider,
} from '@mantine/core';
import {
  IconSmartHome,
  IconChevronLeft,
  IconPlus,
  IconTrash,
  IconEdit,
  IconVideoOff,
  IconArrowUp,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconZoomIn,
  IconZoomOut,
  IconMapPin,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { useState, useEffect, type TouchEvent } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';

interface Camera {
  id: string;
  name: string;
  room: string | null;
  host: string;
  port: number;
  path: string;
  username: string | null;
  password: string | null;
  onvifPort: number | null;
  active: boolean;
  order: number;
}

interface CameraConnection {
  host: string;
  port: number;
  path: string;
  username: string | null;
  password: string | null;
  onvifPort: number | null;
}

interface PtzPreset {
  token: string;
  name: string;
}

interface ImagingSettings {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
}

interface ImagingOptions {
  brightness: { min: number; max: number };
  contrast: { min: number; max: number };
  saturation: { min: number; max: number };
  sharpness: { min: number; max: number };
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
  initial?: { name: string; room: string | null } & Partial<CameraConnection>;
  onSubmit: (data: { name: string; room: string | null } & CameraConnection) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [room, setRoom] = useState<string | null>(initial?.room ?? null);
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(String(initial?.port ?? 554));
  const [path, setPath] = useState(initial?.path ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [onvifPort, setOnvifPort] = useState<string>(
    initial?.onvifPort !== undefined && initial?.onvifPort !== null ? String(initial.onvifPort) : '8000',
  );

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
        <Group grow>
          <TextInput
            label="Adresse IP / nom d'hôte"
            placeholder="192.168.1.x"
            value={host}
            onChange={(e) => setHost(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Port"
            value={port}
            onChange={(e) => setPort(e.currentTarget.value.replace(/\D/g, ''))}
          />
        </Group>
        <TextInput
          label="Chemin du flux"
          description="ex. /h264Preview_01_main"
          placeholder="/..."
          value={path}
          onChange={(e) => setPath(e.currentTarget.value)}
        />
        <Group grow>
          <TextInput label="Identifiant" value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
          <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
        </Group>
        <TextInput
          label="Port ONVIF"
          description="Contrôle PTZ et réglages image — laisser vide si la caméra ne le supporte pas"
          placeholder="8000"
          value={onvifPort}
          onChange={(e) => setOnvifPort(e.currentTarget.value.replace(/\D/g, ''))}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={submitting}
            disabled={!name.trim() || !host.trim()}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                room,
                host: host.trim(),
                port: Number(port) || 554,
                path: path.trim(),
                username: username.trim() || null,
                password: password || null,
                onvifPort: onvifPort ? Number(onvifPort) : null,
              })
            }
          >
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function PtzPad({ cameraId }: { cameraId: string }) {
  const moveMutation = useMutation({
    mutationFn: (vector: { x: number; y: number; zoom: number }) => api.post(`/cameras/${cameraId}/ptz/move`, vector),
    onError: () => notifications.show({ color: 'red', title: 'Échec', message: 'Impossible de déplacer la caméra' }),
  });
  const stopMutation = useMutation({
    mutationFn: () => api.post(`/cameras/${cameraId}/ptz/stop`),
  });

  const held = (vector: { x: number; y: number; zoom: number }) => ({
    onMouseDown: () => moveMutation.mutate(vector),
    onMouseUp: () => stopMutation.mutate(),
    onMouseLeave: () => stopMutation.mutate(),
    onTouchStart: (e: TouchEvent) => {
      e.preventDefault();
      moveMutation.mutate(vector);
    },
    onTouchEnd: () => stopMutation.mutate(),
  });

  return (
    <Group justify="center" gap="xs">
      <Stack gap={4} align="center">
        <ActionIcon variant="light" size="lg" {...held({ x: 0, y: 0.5, zoom: 0 })}>
          <IconArrowUp size={18} />
        </ActionIcon>
        <Group gap={4}>
          <ActionIcon variant="light" size="lg" {...held({ x: -0.5, y: 0, zoom: 0 })}>
            <IconArrowLeft size={18} />
          </ActionIcon>
          <ActionIcon variant="light" size="lg" {...held({ x: 0, y: -0.5, zoom: 0 })}>
            <IconArrowDown size={18} />
          </ActionIcon>
          <ActionIcon variant="light" size="lg" {...held({ x: 0.5, y: 0, zoom: 0 })}>
            <IconArrowRight size={18} />
          </ActionIcon>
        </Group>
      </Stack>
      <Stack gap={4}>
        <ActionIcon variant="light" size="lg" {...held({ x: 0, y: 0, zoom: 0.5 })}>
          <IconZoomIn size={18} />
        </ActionIcon>
        <ActionIcon variant="light" size="lg" {...held({ x: 0, y: 0, zoom: -0.5 })}>
          <IconZoomOut size={18} />
        </ActionIcon>
      </Stack>
    </Group>
  );
}

function PtzPresets({ cameraId }: { cameraId: string }) {
  const queryClient = useQueryClient();
  const [presetName, setPresetName] = useState('');

  const { data: presets } = useQuery<PtzPreset[]>({
    queryKey: ['ptz-presets', cameraId],
    queryFn: () => api.get(`/cameras/${cameraId}/ptz/presets`).then((r) => r.data),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ptz-presets', cameraId] });

  const gotoMutation = useMutation({
    mutationFn: (token: string) => api.post(`/cameras/${cameraId}/ptz/presets/${token}/goto`),
    onError: () => notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'atteindre ce préréglage" }),
  });

  const saveMutation = useMutation({
    mutationFn: (name: string) => api.post(`/cameras/${cameraId}/ptz/presets`, { name }),
    onSuccess: () => {
      invalidate();
      setPresetName('');
    },
    onError: () => notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'enregistrer le préréglage" }),
  });

  const removeMutation = useMutation({
    mutationFn: (token: string) => api.delete(`/cameras/${cameraId}/ptz/presets/${token}`),
    onSuccess: invalidate,
  });

  return (
    <Stack gap="xs">
      <Group gap="xs">
        {(presets ?? []).map((p) => (
          <Button
            key={p.token}
            size="xs"
            variant="default"
            leftSection={<IconMapPin size={14} />}
            rightSection={
              <ActionIcon
                size="xs"
                variant="transparent"
                color="red"
                component="span"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMutation.mutate(p.token);
                }}
              >
                <IconTrash size={12} />
              </ActionIcon>
            }
            onClick={() => gotoMutation.mutate(p.token)}
          >
            {p.name}
          </Button>
        ))}
      </Group>
      <Group gap="xs">
        <TextInput
          size="xs"
          placeholder="Nom du préréglage"
          value={presetName}
          onChange={(e) => setPresetName(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button size="xs" disabled={!presetName.trim()} loading={saveMutation.isPending} onClick={() => saveMutation.mutate(presetName.trim())}>
          Enregistrer la position
        </Button>
      </Group>
    </Stack>
  );
}

function ImagingControls({ cameraId }: { cameraId: string }) {
  const { data: options } = useQuery<ImagingOptions>({
    queryKey: ['imaging-options', cameraId],
    queryFn: () => api.get(`/cameras/${cameraId}/imaging/options`).then((r) => r.data),
    retry: false,
  });
  const { data: settings } = useQuery<ImagingSettings>({
    queryKey: ['imaging-settings', cameraId],
    queryFn: () => api.get(`/cameras/${cameraId}/imaging`).then((r) => r.data),
    retry: false,
    enabled: !!options,
  });

  const [local, setLocal] = useState<ImagingSettings>({});
  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const setMutation = useMutation({
    mutationFn: (patch: ImagingSettings) => api.patch(`/cameras/${cameraId}/imaging`, patch),
    onError: () => {
      notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'appliquer le réglage à la caméra" });
      if (settings) setLocal(settings);
    },
  });

  if (!options || !settings) return null;

  const fields: { key: keyof ImagingSettings; label: string }[] = [
    { key: 'brightness', label: 'Luminosité' },
    { key: 'contrast', label: 'Contraste' },
    { key: 'saturation', label: 'Saturation' },
    { key: 'sharpness', label: 'Netteté' },
  ];

  return (
    <Stack gap="xs">
      {fields.map(({ key, label }) => (
        <div key={key}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Slider
            min={options[key].min}
            max={options[key].max}
            value={local[key] ?? options[key].min}
            onChange={(value) => setLocal((prev) => ({ ...prev, [key]: value }))}
            onChangeEnd={(value) => setMutation.mutate({ ...local, [key]: value })}
          />
        </div>
      ))}
    </Stack>
  );
}

function CameraControls({ camera }: { camera: Camera }) {
  if (!camera.onvifPort) return null;
  return (
    <Stack gap="sm" mt="sm">
      <Divider label="Contrôle de la caméra" labelPosition="left" />
      <PtzPad cameraId={camera.id} />
      <PtzPresets cameraId={camera.id} />
      <ImagingControls cameraId={camera.id} />
    </Stack>
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
        {expanded && <CameraControls camera={camera} />}
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
    mutationFn: (data: { name: string; room: string | null } & CameraConnection) => api.post('/cameras', data),
    onSuccess: () => {
      invalidate();
      closeForm();
      notifications.show({ color: 'teal', title: 'Caméra ajoutée', message: '' });
    },
    onError: () => notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'ajouter la caméra" }),
  });

  const updateCamera = useMutation({
    mutationFn: (data: { id: string; name: string; room: string | null } & CameraConnection) => {
      const { id, ...rest } = data;
      return api.patch(`/cameras/${id}`, rest);
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
        key={editingCamera?.id ?? 'new'}
        opened={formOpened}
        onClose={() => {
          closeForm();
          setEditingCamera(null);
        }}
        rooms={rooms ?? []}
        initial={
          editingCamera
            ? {
                name: editingCamera.name,
                room: editingCamera.room,
                host: editingCamera.host,
                port: editingCamera.port,
                path: editingCamera.path,
                username: editingCamera.username,
                password: editingCamera.password,
                onvifPort: editingCamera.onvifPort,
              }
            : undefined
        }
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
