'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Stack, Group, Text, Loader, Alert, Anchor } from '@mantine/core';
import { IconAlertCircle, IconExternalLink } from '@tabler/icons-react';

// Carte d'analyse en surface (isobares, fronts, centres H/T) du service météo allemand DWD,
// domaine Atlantique Nord/Europe — couvre largement la France. Publiée sur leur serveur open
// data (conçu pour la réutilisation) avec une URL "LATEST" stable qui pointe toujours vers la
// dernière analyse (mise à jour toutes les 6h). Contrairement à une grille de points
// interpolée maison, c'est une vraie analyse synoptique (fronts chauds/froids/occlus tracés).
const DWD_MAP_URL =
  'https://opendata.dwd.de/weather/charts/analysis/Z__C_EDZW_LATEST_tka01%2Cana_bwkman_dwdna_O_000000_000000_LATEST_WV12.png';

export function WeatherMap() {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement>(null);

  // Si l'image est déjà en cache navigateur, elle peut être chargée (et l'évènement "load"
  // déclenché) avant même que ce composant ne monte son handler onLoad — auquel cas
  // l'évènement est manqué et le chargeur resterait affiché indéfiniment. On vérifie donc
  // aussi l'état `complete` de l'image après montage.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setStatus('loaded');
    }
  }, []);

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <Text fw={500}>Carte des masses d'air</Text>
          <Anchor href={DWD_MAP_URL} target="_blank" rel="noopener noreferrer" size="xs">
            <Group gap={4} wrap="nowrap">
              Voir en plein écran <IconExternalLink size={12} />
            </Group>
          </Anchor>
        </Group>
        <Text size="xs" c="dimmed">
          Analyse de surface Europe/Atlantique Nord (isobares, fronts, anticyclones et
          dépressions) — source Deutscher Wetterdienst (DWD), mise à jour toutes les 6h.
        </Text>

        {status === 'loading' && <Loader />}
        {status === 'error' && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            Impossible de charger la carte DWD.
          </Alert>
        )}

        <img
          ref={imgRef}
          src={DWD_MAP_URL}
          alt="Carte d'analyse synoptique Europe/Atlantique Nord (DWD)"
          style={{ width: '100%', height: 'auto', borderRadius: 8, display: status === 'loaded' ? 'block' : 'none' }}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      </Stack>
    </Card>
  );
}
