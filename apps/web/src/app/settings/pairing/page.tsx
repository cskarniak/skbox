'use client';

import { Title, Text, Stack, Button, Group } from '@mantine/core';
import { IconDevicesPc } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function SettingsPairingPage() {
  const permitJoin = useMutation({
    mutationFn: (enable: boolean) => api.post('/zigbee/permit-join', { enable, duration: 120 }),
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
    </Stack>
  );
}
