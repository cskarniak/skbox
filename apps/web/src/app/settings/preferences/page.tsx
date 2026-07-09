'use client';

import { Title, Text, Stack, Card, NumberInput, TextInput, PasswordInput, Button, Group, Switch } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSend } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface PreferenceField {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
}

const HEALTHCHECK_FIELDS: PreferenceField[] = [
  {
    key: 'zigbee.healthcheckIntervalSec',
    label: 'Intervalle de vérification Zigbee',
    description: "Fréquence à laquelle l'API vérifie la connexion Zigbee2MQTT (s). Nécessite un redémarrage de l'API.",
    defaultValue: 60,
  },
  {
    key: 'zigbee.healthcheckTimeoutSec',
    label: 'Timeout hors-ligne Zigbee',
    description: "Délai sans message Zigbee2MQTT avant de marquer les appareils Zigbee hors-ligne (s). Appliqué sans redémarrage.",
    defaultValue: 120,
  },
  {
    key: 'rfxcom.watchdogIntervalSec',
    label: 'Intervalle de vérification RFXcom',
    description: "Fréquence à laquelle l'API vérifie la connexion rfxcom2mqtt (s). Nécessite un redémarrage de l'API.",
    defaultValue: 60,
  },
  {
    key: 'rfxcom.watchdogTimeoutSec',
    label: 'Timeout hors-ligne RFXcom',
    description: "Délai sans message rfxcom2mqtt avant de marquer les appareils RF433 hors-ligne (s). Appliqué sans redémarrage.",
    defaultValue: 120,
  },
  {
    key: 'tailscale.healthcheckIntervalSec',
    label: 'Intervalle de vérification Tailscale',
    description: "Fréquence à laquelle l'API vérifie la connexion Tailscale et tente une reconnexion si besoin (s). Nécessite un redémarrage de l'API.",
    defaultValue: 60,
  },
];

interface AutoRestartField {
  key: string;
  label: string;
  description: string;
}

const AUTO_RESTART_FIELDS: AutoRestartField[] = [
  {
    key: 'zigbee.autoRestartEnabled',
    label: 'Relance automatique Zigbee',
    description:
      'Redémarre le service skbox-z2m si le bridge Zigbee2MQTT reste hors-ligne au-delà du timeout ci-dessus (au minimum 10 min entre deux tentatives).',
  },
  {
    key: 'rfxcom.autoRestartEnabled',
    label: 'Relance automatique RFXcom',
    description:
      'Redémarre le service skbox-rfxcom si le bridge rfxcom2mqtt reste hors-ligne au-delà du timeout ci-dessus (au minimum 10 min entre deux tentatives).',
  },
  {
    key: 'tailscale.autoRestartEnabled',
    label: 'Relance automatique Tailscale',
    description:
      "Redémarre le service tailscaled si la connexion au tailnet reste indisponible malgré les tentatives de reconnexion automatiques (au minimum 10 min entre deux tentatives). Ces tentatives de reconnexion légères (tailscale up) ont lieu à chaque vérification, indépendamment de ce réglage.",
  },
];

interface TextField {
  key: string;
  label: string;
  secret?: boolean;
}

const TELEGRAM_FIELDS: TextField[] = [
  { key: 'alarms.telegramBotToken', label: 'Token du bot Telegram', secret: true },
  { key: 'alarms.telegramChatId', label: 'Chat ID Telegram' },
];

const SMTP_FIELDS: TextField[] = [
  { key: 'alarms.smtpHost', label: 'Serveur SMTP' },
  { key: 'alarms.smtpPort', label: 'Port SMTP' },
  { key: 'alarms.smtpUser', label: 'Utilisateur SMTP' },
  { key: 'alarms.smtpPass', label: 'Mot de passe SMTP', secret: true },
  { key: 'alarms.smtpFrom', label: 'Adresse expéditeur' },
  { key: 'alarms.smtpTo', label: 'Adresse destinataire' },
];

function TextSettingInput({ field }: { field: TextField }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');

  const { data } = useQuery<{ value: string | null }>({
    queryKey: ['settings', field.key],
    queryFn: () => api.get(`/settings/${field.key}`).then((r) => r.data),
    staleTime: Infinity,
  });

  useEffect(() => {
    setValue(data?.value ?? '');
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put(`/settings/${field.key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', field.key] });
      notifications.show({ color: 'teal', title: 'Enregistré', message: field.label });
    },
    onError: () => {
      notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'enregistrer ce paramètre" });
    },
  });

  const Input = field.secret ? PasswordInput : TextInput;

  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap">
      <Input
        label={field.label}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        w={320}
      />
      <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
        Enregistrer
      </Button>
    </Group>
  );
}

function TestNotificationButton({ endpoint, label }: { endpoint: string; label: string }) {
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; error?: string }>(endpoint).then((r) => r.data),
    onSuccess: (result) => {
      if (result.ok) {
        notifications.show({ color: 'teal', title: 'Envoyé', message: `Message de test ${label} envoyé` });
      } else {
        notifications.show({ color: 'red', title: 'Échec', message: result.error ?? 'Envoi impossible' });
      }
    },
    onError: () => {
      notifications.show({ color: 'red', title: 'Échec', message: "Impossible de contacter l'API" });
    },
  });

  return (
    <Button
      variant="light"
      size="sm"
      leftSection={<IconSend size={14} />}
      loading={test.isPending}
      onClick={() => test.mutate()}
    >
      Tester {label}
    </Button>
  );
}

function AutoRestartToggle({ field }: { field: AutoRestartField }) {
  const queryClient = useQueryClient();

  const { data } = useQuery<{ value: string | null }>({
    queryKey: ['settings', field.key],
    queryFn: () => api.get(`/settings/${field.key}`).then((r) => r.data),
    staleTime: Infinity,
  });

  const save = useMutation({
    mutationFn: (checked: boolean) => api.put(`/settings/${field.key}`, { value: String(checked) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', field.key] });
      notifications.show({ color: 'teal', title: 'Enregistré', message: field.label });
    },
    onError: () => {
      notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'enregistrer ce paramètre" });
    },
  });

  return (
    <Switch
      label={field.label}
      description={field.description}
      checked={data?.value === 'true'}
      onChange={(e) => save.mutate(e.currentTarget.checked)}
    />
  );
}

function PreferenceInput({ field }: { field: PreferenceField }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(field.defaultValue);

  const { data } = useQuery<{ value: string | null }>({
    queryKey: ['settings', field.key],
    queryFn: () => api.get(`/settings/${field.key}`).then((r) => r.data),
    staleTime: Infinity,
  });

  useEffect(() => {
    const parsed = data?.value ? parseInt(data.value, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) setValue(parsed);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put(`/settings/${field.key}`, { value: String(value) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', field.key] });
      notifications.show({ color: 'teal', title: 'Enregistré', message: field.label });
    },
    onError: () => {
      notifications.show({ color: 'red', title: 'Échec', message: "Impossible d'enregistrer ce paramètre" });
    },
  });

  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap">
      <NumberInput
        label={field.label}
        description={field.description}
        min={1}
        value={value}
        onChange={(v) => setValue(typeof v === 'number' ? v : field.defaultValue)}
        w={320}
      />
      <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
        Enregistrer
      </Button>
    </Group>
  );
}

export default function SettingsPreferencesPage() {
  return (
    <Stack gap="lg">
      <Title order={4}>Préférences</Title>
      <Text size="sm" c="dimmed">
        Paramètres de fonctionnement de la plateforme, modifiables sans toucher au code.
      </Text>

      <Card shadow="sm" padding="lg" withBorder>
        <Text size="sm" c="dimmed" mb="md">
          Détection en ligne / hors-ligne
        </Text>
        <Stack gap="md">
          {HEALTHCHECK_FIELDS.map((field) => (
            <PreferenceInput key={field.key} field={field} />
          ))}
        </Stack>
      </Card>

      <Card shadow="sm" padding="lg" withBorder>
        <Text size="sm" c="dimmed" mb="md">
          Relance automatique des bridges
        </Text>
        <Stack gap="md">
          {AUTO_RESTART_FIELDS.map((field) => (
            <AutoRestartToggle key={field.key} field={field} />
          ))}
        </Stack>
      </Card>

      <Card shadow="sm" padding="lg" withBorder>
        <Group justify="space-between" mb="md">
          <Text size="sm" c="dimmed">
            Notifications d&apos;alarme — Telegram
          </Text>
          <TestNotificationButton endpoint="/notifications/test/telegram" label="Telegram" />
        </Group>
        <Stack gap="md">
          {TELEGRAM_FIELDS.map((field) => (
            <TextSettingInput key={field.key} field={field} />
          ))}
        </Stack>
      </Card>

      <Card shadow="sm" padding="lg" withBorder>
        <Group justify="space-between" mb="md">
          <Text size="sm" c="dimmed">
            Notifications d&apos;alarme — Email (SMTP)
          </Text>
          <TestNotificationButton endpoint="/notifications/test/email" label="email" />
        </Group>
        <Stack gap="md">
          {SMTP_FIELDS.map((field) => (
            <TextSettingInput key={field.key} field={field} />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
