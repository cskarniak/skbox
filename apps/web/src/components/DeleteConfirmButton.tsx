'use client';

import { ActionIcon, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

export function DeleteConfirmButton({
  onConfirm,
  loading,
  label = 'Supprimer ?',
  size = 'sm',
}: {
  onConfirm: () => void;
  loading?: boolean;
  label?: string;
  size?: 'xs' | 'sm';
}) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened} withArrow position="bottom-end">
      <Popover.Target>
        <ActionIcon
          size={size}
          variant="subtle"
          color="red"
          onClick={() => setOpened((o) => !o)}
        >
          <IconTrash size={size === 'xs' ? 12 : 16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm">{label}</Text>
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="subtle" onClick={() => setOpened(false)}>
              Non
            </Button>
            <Button
              size="xs"
              color="red"
              loading={loading}
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
