'use client';

import { ActionIcon, Modal, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowsMaximize } from '@tabler/icons-react';
import { ReactNode } from 'react';

// Hauteur du graphique une fois agrandi en plein écran — nettement plus grand que la
// hauteur par défaut (280) sans dépendre de la taille de la fenêtre.
const EXPANDED_HEIGHT = 640;

export function ExpandableChart({ title, children }: { title?: string; children: (height: number) => ReactNode }) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <div style={{ position: 'relative' }}>
        <Tooltip label="Agrandir">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}
            onClick={open}
          >
            <IconArrowsMaximize size={16} />
          </ActionIcon>
        </Tooltip>
        {children(280)}
      </div>
      <Modal opened={opened} onClose={close} title={title} size="90%">
        {children(EXPANDED_HEIGHT)}
      </Modal>
    </>
  );
}
