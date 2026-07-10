'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Stack, Group, Text, SegmentedControl, Loader, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type MapVariable = 'pressure' | 'temperature';

interface MapGridPoint {
  lat: number;
  lon: number;
  value: number;
}

interface WeatherMapData {
  variable: MapVariable;
  unit: string;
  generatedAt: string;
  bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number };
  points: MapGridPoint[];
}

export interface MapMarker {
  lat: number;
  lon: number;
  color: string;
  label: string;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 480;
const BLOCK_SIZE = 3;
// Écart-type du noyau gaussien, en degrés — calé sur l'espacement de la grille source
// (~1.2° de latitude) pour que les points voisins se fondent en un dégradé continu au lieu
// de "bulles" isolées (défaut classique de l'interpolation par distance inverse pure).
const GAUSSIAN_SIGMA_DEG = 1.4;

// Échelle divergente : bleu (dépression / plus frais) -> gris neutre -> orange (anticyclone /
// plus chaud). Pour la pression, le point neutre est la pression atmosphérique standard
// (1013 hPa) ; pour la température, le milieu de la plage observée sur la carte.
const LOW_COLOR: [number, number, number] = [57, 135, 229];
const MID_COLOR: [number, number, number] = [110, 118, 128];
const HIGH_COLOR: [number, number, number] = [201, 133, 0];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function colorForValue(value: number, min: number, mid: number, max: number): [number, number, number] {
  const [from, to, t] =
    value <= mid
      ? [LOW_COLOR, MID_COLOR, mid === min ? 0 : Math.max(0, Math.min(1, (value - min) / (mid - min)))]
      : [MID_COLOR, HIGH_COLOR, max === mid ? 0 : Math.max(0, Math.min(1, (value - mid) / (max - mid)))];
  return [Math.round(lerp(from[0], to[0], t)), Math.round(lerp(from[1], to[1], t)), Math.round(lerp(from[2], to[2], t))];
}

export function WeatherMap({ markers }: { markers: MapMarker[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [variable, setVariable] = useState<MapVariable>('pressure');

  const mapQuery = useQuery<WeatherMapData>({
    queryKey: ['weather-map', variable],
    queryFn: () => api.get('/weather/map', { params: { variable } }).then((r) => r.data),
    staleTime: 10 * 60_000,
  });

  const data = mapQuery.data;
  const values = data?.points.map((p) => p.value) ?? [];
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const mid = variable === 'pressure' ? 1013 : (min + max) / 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.points.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { bounds, points } = data;
    const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
    const twoSigmaSq = 2 * GAUSSIAN_SIGMA_DEG * GAUSSIAN_SIGMA_DEG;

    // Interpolation par noyau gaussien : chaque pixel prend une moyenne des points de
    // grille pondérée par une exponentielle décroissante de la distance, ce qui fond les
    // points voisins en un dégradé continu (contrairement à 1/distance², qui crée des
    // "bulles" isolées autour de chaque point source).
    for (let py = 0; py < CANVAS_HEIGHT; py += BLOCK_SIZE) {
      const lat = bounds.latMax - (py / CANVAS_HEIGHT) * (bounds.latMax - bounds.latMin);
      for (let px = 0; px < CANVAS_WIDTH; px += BLOCK_SIZE) {
        const lon = bounds.lonMin + (px / CANVAS_WIDTH) * (bounds.lonMax - bounds.lonMin);

        let weightedSum = 0;
        let weightTotal = 0;
        for (const p of points) {
          const dLat = p.lat - lat;
          const dLon = p.lon - lon;
          const distSq = dLat * dLat + dLon * dLon;
          const weight = Math.exp(-distSq / twoSigmaSq);
          weightedSum += p.value * weight;
          weightTotal += weight;
        }
        const [r, g, b] = colorForValue(weightedSum / weightTotal, min, mid, max);

        for (let by = 0; by < BLOCK_SIZE && py + by < CANVAS_HEIGHT; by++) {
          for (let bx = 0; bx < BLOCK_SIZE && px + bx < CANVAS_WIDTH; bx++) {
            const idx = ((py + by) * CANVAS_WIDTH + (px + bx)) * 4;
            imageData.data[idx] = r;
            imageData.data[idx + 1] = g;
            imageData.data[idx + 2] = b;
            imageData.data[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Graticule (lignes de latitude/longitude) : sans contour de côte disponible, ces
    // repères sont le seul moyen de situer les couleurs géographiquement.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '11px sans-serif';
    ctx.lineWidth = 1;
    for (let lat = Math.ceil(bounds.latMin / 2) * 2; lat < bounds.latMax; lat += 2) {
      const y = ((bounds.latMax - lat) / (bounds.latMax - bounds.latMin)) * CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
      ctx.fillText(`${lat}°N`, 4, y - 3);
    }
    for (let lon = Math.ceil(bounds.lonMin / 2) * 2; lon < bounds.lonMax; lon += 2) {
      const x = ((lon - bounds.lonMin) / (bounds.lonMax - bounds.lonMin)) * CANVAS_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.fillText(`${lon}°E`, x + 3, 12);
    }

    for (const m of markers) {
      const x = ((m.lon - bounds.lonMin) / (bounds.lonMax - bounds.lonMin)) * CANVAS_WIDTH;
      const y = ((bounds.latMax - m.lat) / (bounds.latMax - bounds.latMin)) * CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(m.label, x + 9, y + 4);
      ctx.fillText(m.label, x + 9, y + 4);
    }
  }, [data, markers, min, mid, max]);

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <Text fw={500}>Carte des masses d'air</Text>
          <SegmentedControl
            size="xs"
            value={variable}
            onChange={(v) => setVariable(v as MapVariable)}
            data={[
              { label: 'Pression', value: 'pressure' },
              { label: 'Température', value: 'temperature' },
            ]}
          />
        </Group>
        <Text size="xs" c="dimmed">
          Vue régionale (Europe de l'Ouest) —{' '}
          {variable === 'pressure'
            ? 'bleu = dépression / temps perturbé, orange = anticyclone / temps stable'
            : 'bleu = plus frais, orange = plus chaud'}
          . Interpolation approximative à partir d'une grille de points, pas une analyse officielle des fronts.
        </Text>

        {mapQuery.isLoading && <Loader />}
        {mapQuery.isError && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            Impossible de charger la carte.
          </Alert>
        )}

        {data && (
          <>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={{ width: '100%', height: 'auto', borderRadius: 8, aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
            />
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" c="dimmed">{min.toFixed(0)} {data.unit}</Text>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  margin: '0 8px',
                  borderRadius: 4,
                  background: `linear-gradient(to right, rgb(${LOW_COLOR.join(',')}), rgb(${MID_COLOR.join(',')}), rgb(${HIGH_COLOR.join(',')}))`,
                }}
              />
              <Text size="xs" c="dimmed">{max.toFixed(0)} {data.unit}</Text>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );
}
