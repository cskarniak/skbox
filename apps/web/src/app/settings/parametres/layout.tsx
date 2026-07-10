'use client';

import { Tabs } from '@mantine/core';
import { IconCategory, IconMapPin, IconPalette, IconLayoutGrid } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';

const SUB_TABS = [
  { value: 'objets', label: 'Objets', icon: <IconCategory size={16} />, href: '/settings/parametres/objets' },
  { value: 'pieces', label: 'Pièces', icon: <IconMapPin size={16} />, href: '/settings/parametres/pieces' },
  { value: 'themes', label: 'Thèmes', icon: <IconPalette size={16} />, href: '/settings/parametres/themes' },
  {
    value: 'groupes-scenarios',
    label: 'Groupes de scénarios',
    icon: <IconLayoutGrid size={16} />,
    href: '/settings/parametres/groupes-scenarios',
  },
];

export default function ParametresLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const activeSubTab = SUB_TABS.find((t) => pathname.startsWith(t.href))?.value ?? 'objets';

  return (
    <div>
      <Tabs
        value={activeSubTab}
        onChange={(v) => {
          const tab = SUB_TABS.find((t) => t.value === v);
          if (tab) router.push(tab.href);
        }}
        mb="md"
      >
        <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          {SUB_TABS.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value} leftSection={tab.icon} style={{ flexShrink: 0 }}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {children}
    </div>
  );
}
