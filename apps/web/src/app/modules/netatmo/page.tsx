'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Badge,
  Stack,
  Button,
  TextInput,
  PasswordInput,
  Card,
  Popover,
  Anchor,
} from '@mantine/core';
import { IconSmartHome, IconTemperature } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';

interface NetatmoStatus {
  configured: boolean;
  connected: boolean;
  roomName: string | null;
  deviceId: string | null;
  temperature: number | null;
  setpoint: number | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

function DisconnectConfirm({ onConfirm, loading }: { onConfirm: () => void; loading: boolean }) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} withArrow shadow="md">
      <Popover.Target>
        <Button variant="default" color="red" loading={loading} onClick={() => setOpened(true)}>
          Déconnecter
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={500}>Déconnecter Netatmo ?</Text>
          <Text size="xs" c="dimmed">
            L&apos;appareil et son historique sont conservés, mais ne seront plus mis à jour tant que vous ne vous reconnectez pas.
          </Text>
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="default" onClick={() => setOpened(false)}>Non</Button>
            <Button
              size="xs"
              color="red"
              onClick={() => {
                onConfirm();
                setOpened(false);
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

export default function NetatmoPage() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const { data: status } = useQuery<NetatmoStatus>({
    queryKey: ['netatmo-status'],
    queryFn: () => api.get('/netatmo/status').then((r) => r.data),
    refetchInterval: 30000,
  });

  const saveCredentials = useMutation({
    mutationFn: () => api.put('/netatmo/credentials', { clientId, clientSecret }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['netatmo-status'] }),
  });

  const getAuthorizeUrl = useMutation({
    mutationFn: () => api.get('/netatmo/authorize-url').then((r) => r.data as { url: string }),
    onSuccess: (data) => {
      setAuthorizeUrl(data.url);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    },
  });

  const connect = useMutation({
    mutationFn: () => api.post('/netatmo/connect', { code }),
    onSuccess: () => {
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['netatmo-status'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.post('/netatmo/disconnect'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['netatmo-status'] }),
  });

  const syncNow = useMutation({
    mutationFn: () => api.post('/netatmo/sync-now'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['netatmo-status'] }),
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
        <Stack gap="lg" maw={640}>
          <Title order={4}>Netatmo</Title>
          <Text size="sm" c="dimmed">
            Lecture de la température du thermostat Netatmo (NATherm1 + relais NAPlug1), exposée comme un appareil Skbox normal.
          </Text>

          {status?.connected ? (
            <Card shadow="sm" padding="lg" withBorder>
              <Group justify="space-between" mb="xs">
                <Group gap="sm">
                  <IconTemperature size={22} />
                  <Text fw={500}>{status.roomName ?? 'Thermostat'}</Text>
                </Group>
                <Badge color={status.lastError ? 'red' : 'green'} variant="light">
                  {status.lastError ? 'Erreur' : 'Connecté'}
                </Badge>
              </Group>
              <Stack gap={4} mb="md">
                <Text size="sm">
                  Température : {status.temperature !== null ? `${status.temperature.toFixed(1)} °C` : '—'}
                </Text>
                {status.setpoint !== null && (
                  <Text size="sm" c="dimmed">Consigne : {status.setpoint.toFixed(1)} °C</Text>
                )}
                <Text size="xs" c="dimmed">
                  Dernière synchro : {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString('fr-FR') : '—'}
                </Text>
                {status.lastError && (
                  <Text size="xs" c="red">{status.lastError}</Text>
                )}
              </Stack>
              <Group gap="xs">
                <Button variant="light" loading={syncNow.isPending} onClick={() => syncNow.mutate()}>
                  Resynchroniser maintenant
                </Button>
                <DisconnectConfirm onConfirm={() => disconnect.mutate()} loading={disconnect.isPending} />
              </Group>
            </Card>
          ) : (
            <>
              <Card shadow="sm" padding="lg" withBorder>
                <Title order={5} mb="xs">1. Identifiants</Title>
                <Text size="xs" c="dimmed" mb="sm">
                  Créés sur <Anchor href="https://dev.netatmo.com/apps/createanapp" target="_blank" rel="noopener noreferrer">dev.netatmo.com</Anchor>, avec &quot;Redirect URI&quot; = <code>http://localhost/</code>.
                </Text>
                <Stack gap="sm">
                  <TextInput
                    label="Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.currentTarget.value)}
                  />
                  <PasswordInput
                    label="Client Secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.currentTarget.value)}
                  />
                  <Group>
                    <Button
                      loading={saveCredentials.isPending}
                      disabled={!clientId || !clientSecret}
                      onClick={() => saveCredentials.mutate()}
                    >
                      Enregistrer
                    </Button>
                  </Group>
                </Stack>
              </Card>

              <Card shadow="sm" padding="lg" withBorder>
                <Title order={5} mb="xs">2. Autorisation</Title>
                <Text size="xs" c="dimmed" mb="sm">
                  Ouvre la page d&apos;autorisation Netatmo dans un nouvel onglet. Une fois autorisé, le
                  navigateur atterrit sur une page qui ne répondra pas (<code>http://localhost/?code=...</code>)
                  — copiez le <code>code</code> depuis la barre d&apos;adresse et collez-le ci-dessous.
                </Text>
                <Stack gap="sm">
                  <Group>
                    <Button
                      variant="light"
                      disabled={!status?.configured}
                      loading={getAuthorizeUrl.isPending}
                      onClick={() => getAuthorizeUrl.mutate()}
                    >
                      Autoriser Skbox sur Netatmo
                    </Button>
                  </Group>
                  {authorizeUrl && (
                    <Text size="xs" c="dimmed">
                      Si la fenêtre ne s&apos;est pas ouverte : <Anchor href={authorizeUrl} target="_blank" rel="noopener noreferrer">ouvrir le lien</Anchor>
                    </Text>
                  )}
                  <TextInput
                    label="Code d'autorisation"
                    placeholder="Collez le code ici"
                    value={code}
                    onChange={(e) => setCode(e.currentTarget.value)}
                  />
                  <Group>
                    <Button
                      loading={connect.isPending}
                      disabled={!code}
                      onClick={() => connect.mutate()}
                    >
                      Connecter
                    </Button>
                  </Group>
                  {connect.isError && (
                    <Text size="xs" c="red">
                      Échec de la connexion — vérifiez le code (il n&apos;est utilisable qu&apos;une fois) et réessayez.
                    </Text>
                  )}
                </Stack>
              </Card>
            </>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
