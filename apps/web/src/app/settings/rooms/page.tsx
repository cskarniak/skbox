'use client';

import { Title, Text, Stack, Card } from '@mantine/core';
import { NamedListManager } from '@/components/NamedListManager';

export default function SettingsRoomsPage() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Pièces</Title>
        <Text size="sm" c="dimmed">
          Pièces disponibles pour l&apos;affectation des appareils. L&apos;assignation des appareils se
          fait depuis l&apos;onglet Appareils.
        </Text>
      </div>

      <Card shadow="sm" padding="lg" withBorder maw={480}>
        <NamedListManager
          title="Pièces"
          description="Pièces disponibles pour l'affectation des appareils."
          queryKey="rooms"
          endpoint="/rooms"
        />
      </Card>
    </Stack>
  );
}
