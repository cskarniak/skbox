'use client';

import { Title, Text, Stack, Card, NumberInput, Button, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
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
];

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
    </Stack>
  );
}
