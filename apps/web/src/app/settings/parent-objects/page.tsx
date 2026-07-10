'use client';

import { Title, Text, Stack, Card } from '@mantine/core';
import { NamedListManager } from '@/components/NamedListManager';

export default function SettingsParentObjectsPage() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Objets</Title>
        <Text size="sm" c="dimmed">
          Regroupements de haut niveau (ex: Maison, Garage, Jardin). L&apos;assignation des appareils se
          fait depuis l&apos;onglet Appareils.
        </Text>
      </div>

      <Card shadow="sm" padding="lg" withBorder maw={480}>
        <NamedListManager
          title="Objets"
          description="Regroupements de haut niveau (ex: Maison, Garage, Jardin)."
          queryKey="parent-objects"
          endpoint="/parent-objects"
        />
      </Card>
    </Stack>
  );
}
