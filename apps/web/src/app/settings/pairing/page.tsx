'use client';

import { Title, Text, Stack, Button, Group } from '@mantine/core';
import { IconDevicesPc, IconBroadcast } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function SettingsPairingPage() {
  const permitJoin = useMutation({
    mutationFn: (enable: boolean) => api.post('/zigbee/permit-join', { enable, duration: 120 }),
  });

  const rfDiscovery = useMutation({
    mutationFn: (enable: boolean) => api.post('/rfxcom/discovery-mode', { enable, duration: 300 }),
  });

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Appairage</Title>
        <Text size="sm" c="dimmed">
          Autorise l'ajout de nouveaux appareils Zigbee pendant 2 minutes.
        </Text>
      </div>

      <Group>
        <Button
          leftSection={<IconDevicesPc size={16} />}
          loading={permitJoin.isPending}
          onClick={() => permitJoin.mutate(true)}
        >
          Appairer un appareil Zigbee
        </Button>
      </Group>

      <div>
        <Title order={4}>Découverte RF433</Title>
        <Text size="sm" c="dimmed">
          En dehors de ce mode, un appareil RF433 inconnu (bruit, capteur non appairé) est
          ignoré au lieu de créer un nouvel appareil. Active pendant 5 minutes pour ajouter un
          nouveau capteur RF433 (Oregon Scientific, Chacon/DIO, OWL...).
        </Text>
      </div>

      <Group>
        <Button
          leftSection={<IconBroadcast size={16} />}
          loading={rfDiscovery.isPending}
          onClick={() => rfDiscovery.mutate(true)}
        >
          Activer la découverte RF433
        </Button>
      </Group>
    </Stack>
  );
}
