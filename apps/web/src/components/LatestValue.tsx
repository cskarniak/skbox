'use client';

import { Text, Stack } from '@mantine/core';
import { getValueMeta } from '@/lib/history';

export function LatestValue({ valueKey, value }: { valueKey: string; value: number | null }) {
  const { unit } = getValueMeta(valueKey);

  return (
    <Stack gap={0} align="center" justify="center" h={220}>
      {value === null ? (
        <Text size="sm" c="dimmed">
          Aucune valeur disponible.
        </Text>
      ) : (
        <Text fz={48} fw={700}>
          {value}
          {unit && (
            <Text span size="lg" c="dimmed" ml={4}>
              {unit}
            </Text>
          )}
        </Text>
      )}
    </Stack>
  );
}
