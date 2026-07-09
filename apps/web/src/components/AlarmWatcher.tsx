'use client';

import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface AlarmEvent {
  id: string;
  triggeredAt: string;
  scenario: { name: string; severity: 'critical' | 'warning' | null };
}

// Popup global (toast), visible quelle que soit la page ouverte, en complément des
// notifications Telegram/email — celles-ci fonctionnent app fermée, ce popup seulement
// si l'app est ouverte dans un onglet.
export function AlarmWatcher() {
  const seenIds = useRef<Set<string> | null>(null);

  const { data } = useQuery<AlarmEvent[]>({
    queryKey: ['alarm-events', 'open'],
    queryFn: () => api.get('/scenarios/alarm-events', { params: { resolved: false } }).then((r) => r.data),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!data) return;

    // Premier chargement : on mémorise les alarmes déjà actives sans les notifier,
    // pour ne pas déclencher une rafale de popups à l'ouverture de l'app.
    if (seenIds.current === null) {
      seenIds.current = new Set(data.map((e) => e.id));
      return;
    }

    for (const event of data) {
      if (seenIds.current.has(event.id)) continue;
      notifications.show({
        color: event.scenario.severity === 'critical' ? 'red' : 'orange',
        title: event.scenario.name,
        message: `Alarme déclenchée à ${new Date(event.triggeredAt).toLocaleTimeString('fr-FR')}`,
        autoClose: false,
      });
    }

    seenIds.current = new Set(data.map((e) => e.id));
  }, [data]);

  return null;
}
