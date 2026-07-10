'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Stack, Group, Text, Loader, Alert, Anchor } from '@mantine/core';
import { IconAlertCircle, IconExternalLink } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface AirMassMap {
  url: string;
  title: string;
  validAt: string;
  copyright: string;
}

export function WeatherMap() {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement>(null);

  const mapQuery = useQuery<AirMassMap>({
    queryKey: ['weather-air-mass-map'],
    queryFn: () => api.get('/weather/air-mass-map').then((r) => r.data),
    staleTime: 30 * 60_000,
  });

  // Si l'image est déjà en cache navigateur, elle peut être chargée (et l'évènement "load"
  // déclenché) avant même que ce composant ne monte son handler onLoad — auquel cas
  // l'évènement est manqué et le chargeur resterait affiché indéfiniment. On vérifie donc
  // aussi l'état `complete` de l'image après montage.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setStatus('loaded');
    }
  }, [mapQuery.data]);

  const data = mapQuery.data;

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <Text fw={500}>Carte des masses d'air</Text>
          {data && (
            <Anchor href={data.url} target="_blank" rel="noopener noreferrer" size="xs">
              <Group gap={4} wrap="nowrap">
                Voir en plein écran <IconExternalLink size={12} />
              </Group>
            </Anchor>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          Géopotentiel 500hPa et température de la masse d'air à 850hPa (~1500m d'altitude,
          indépendante du réchauffement local en surface) — source ECMWF (CC BY 4.0), mise à
          jour à chaque run du modèle.
        </Text>

        {(mapQuery.isLoading || status === 'loading') && !mapQuery.isError && <Loader />}
        {mapQuery.isError && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            Impossible de charger la carte ECMWF.
          </Alert>
        )}

        {data && (
          <img
            ref={imgRef}
            src={data.url}
            alt={data.title}
            style={{ width: '50%', height: 'auto', borderRadius: 8, display: status === 'loaded' ? 'block' : 'none' }}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
          />
        )}
      </Stack>
    </Card>
  );
}
