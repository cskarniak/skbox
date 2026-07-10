'use client';

import {
  AppShell,
  Group,
  Title,
  Text,
  Stack,
  Button,
  Card,
  TextInput,
  ActionIcon,
  SimpleGrid,
  Badge,
  Loader,
  Alert,
  Paper,
} from '@mantine/core';
import {
  IconSmartHome,
  IconChevronLeft,
  IconCloudRain,
  IconSearch,
  IconMapPin,
  IconSun,
  IconCloud,
  IconCloudFog,
  IconCloudSnow,
  IconCloudStorm,
  IconAlertCircle,
  IconStar,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';
import { ValueChart, OverlayChart } from '@/components/ValueChart';
import { CHART_COLORS } from '@/lib/history';
import { WeatherMap, type MapMarker } from './WeatherMap';

interface WeatherLocation {
  lat: number;
  lon: number;
  label: string;
}

interface LocationSearchResult {
  name: string;
  admin1: string | null;
  country: string | null;
  lat: number;
  lon: number;
}

interface DailyForecast {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
  windGustsMax: number;
  uvIndexMax: number;
  sunshineHours: number;
  pressureMean: number | null;
}

interface HourlyForecast {
  time: string;
  weatherCode: number;
  temperature: number;
  precipitationProbability: number;
  precipitation: number;
  windSpeed: number;
}

interface WeatherForecast {
  location: WeatherLocation;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
}

const WEATHER_CODES: Record<number, { label: string; icon: React.ReactNode }> = {
  0: { label: 'Ciel clair', icon: <IconSun size={28} /> },
  1: { label: 'Principalement dégagé', icon: <IconSun size={28} /> },
  2: { label: 'Partiellement nuageux', icon: <IconCloud size={28} /> },
  3: { label: 'Couvert', icon: <IconCloud size={28} /> },
  45: { label: 'Brouillard', icon: <IconCloudFog size={28} /> },
  48: { label: 'Brouillard givrant', icon: <IconCloudFog size={28} /> },
  51: { label: 'Bruine légère', icon: <IconCloudRain size={28} /> },
  53: { label: 'Bruine modérée', icon: <IconCloudRain size={28} /> },
  55: { label: 'Bruine dense', icon: <IconCloudRain size={28} /> },
  56: { label: 'Bruine verglaçante', icon: <IconCloudRain size={28} /> },
  57: { label: 'Bruine verglaçante dense', icon: <IconCloudRain size={28} /> },
  61: { label: 'Pluie légère', icon: <IconCloudRain size={28} /> },
  63: { label: 'Pluie modérée', icon: <IconCloudRain size={28} /> },
  65: { label: 'Pluie forte', icon: <IconCloudRain size={28} /> },
  66: { label: 'Pluie verglaçante', icon: <IconCloudRain size={28} /> },
  67: { label: 'Pluie verglaçante forte', icon: <IconCloudRain size={28} /> },
  71: { label: 'Neige légère', icon: <IconCloudSnow size={28} /> },
  73: { label: 'Neige modérée', icon: <IconCloudSnow size={28} /> },
  75: { label: 'Neige forte', icon: <IconCloudSnow size={28} /> },
  77: { label: 'Neige en grains', icon: <IconCloudSnow size={28} /> },
  80: { label: 'Averses légères', icon: <IconCloudRain size={28} /> },
  81: { label: 'Averses modérées', icon: <IconCloudRain size={28} /> },
  82: { label: 'Averses violentes', icon: <IconCloudRain size={28} /> },
  85: { label: 'Averses de neige légères', icon: <IconCloudSnow size={28} /> },
  86: { label: 'Averses de neige fortes', icon: <IconCloudSnow size={28} /> },
  95: { label: 'Orage', icon: <IconCloudStorm size={28} /> },
  96: { label: 'Orage avec grêle', icon: <IconCloudStorm size={28} /> },
  99: { label: 'Orage violent avec grêle', icon: <IconCloudStorm size={28} /> },
};

function weatherMeta(code: number) {
  return WEATHER_CODES[code] ?? { label: 'Inconnu', icon: <IconCloud size={28} /> };
}

function formatDayLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatHourTick(ms: number) {
  const d = new Date(ms);
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return `${weekday} ${String(d.getHours()).padStart(2, '0')}h`;
}

export default function WeatherModulePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [location, setLocation] = useState<WeatherLocation | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const homeLocationQuery = useQuery<WeatherLocation | null>({
    queryKey: ['weather-home-location'],
    queryFn: () => api.get('/weather/home/location').then((r) => r.data),
  });

  useEffect(() => {
    if (!location && homeLocationQuery.data) {
      setLocation(homeLocationQuery.data);
    }
  }, [homeLocationQuery.data, location]);

  const forecastQuery = useQuery<WeatherForecast>({
    queryKey: ['weather-forecast', location?.lat, location?.lon],
    queryFn: () =>
      api
        .get('/weather/forecast', { params: { lat: location!.lat, lon: location!.lon, label: location!.label } })
        .then((r) => r.data),
    enabled: !!location,
  });

  const searchResultsQuery = useQuery<LocationSearchResult[]>({
    queryKey: ['weather-search', searchQuery],
    queryFn: () => api.get('/weather/search', { params: { q: searchQuery } }).then((r) => r.data),
    enabled: searchQuery.trim().length >= 2,
  });

  const setHomeMutation = useMutation({
    mutationFn: (next: WeatherLocation) => api.put('/weather/home/location', next).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(['weather-home-location'], data);
      notifications.show({ message: 'Lieu par défaut mis à jour', color: 'green' });
    },
  });

  const runSearch = () => setSearchQuery(searchInput);

  const isHome =
    !!location && !!homeLocationQuery.data && location.lat === homeLocationQuery.data.lat && location.lon === homeLocationQuery.data.lon;

  const mapMarkers: MapMarker[] = [];
  if (homeLocationQuery.data) {
    mapMarkers.push({
      lat: homeLocationQuery.data.lat,
      lon: homeLocationQuery.data.lon,
      color: CHART_COLORS[1],
      label: homeLocationQuery.data.label.split(',')[0],
    });
  }
  if (location && !isHome) {
    mapMarkers.push({ lat: location.lat, lon: location.lon, color: CHART_COLORS[0], label: location.label.split(',')[0] });
  }

  const daily = forecastQuery.data?.daily ?? [];

  const tempSeries = daily.length
    ? [
        {
          id: 'tempMax',
          label: 'Max',
          color: CHART_COLORS[5],
          valueKey: 'temperature',
          data: daily.map((d) => ({ time: new Date(`${d.date}T12:00:00`).getTime(), value: d.tempMax })),
        },
        {
          id: 'tempMin',
          label: 'Min',
          color: CHART_COLORS[0],
          valueKey: 'temperature',
          data: daily.map((d) => ({ time: new Date(`${d.date}T12:00:00`).getTime(), value: d.tempMin })),
        },
        {
          id: 'pressure',
          label: 'Pression',
          color: CHART_COLORS[2],
          valueKey: 'pressure',
          data: daily
            .filter((d) => d.pressureMean !== null)
            .map((d) => ({ time: new Date(`${d.date}T12:00:00`).getTime(), value: d.pressureMean as number })),
        },
      ]
    : [];

  const precipSeries = daily.map((d) => ({
    time: new Date(`${d.date}T12:00:00`).getTime(),
    value: d.precipitationSum,
  }));

  const hourly = forecastQuery.data?.hourly ?? [];

  const hourlySeries = hourly.length
    ? [
        {
          id: 'hourlyTemp',
          label: 'Température',
          color: CHART_COLORS[5],
          valueKey: 'temperature',
          data: hourly.map((h) => ({ time: new Date(h.time).getTime(), value: h.temperature })),
        },
        {
          id: 'hourlyPrecipProb',
          label: 'Probabilité de pluie',
          color: CHART_COLORS[0],
          valueKey: 'precipitationProbability',
          data: hourly.map((h) => ({ time: new Date(h.time).getTime(), value: h.precipitationProbability })),
        },
      ]
    : [];

  const hourlyStrip = hourly.filter((_, i) => i % 3 === 0);

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconSmartHome size={28} />
            <Title order={3}>Skbox</Title>
          </Group>
          <Group gap="md">
            <AppNav active="modules" />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="lg">
          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={() => router.push('/modules')}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Text size="sm" c="dimmed">Modules</Text>
            <Text size="sm" c="dimmed">/</Text>
            <IconCloudRain size={18} />
            <Text size="sm" fw={500}>Météo</Text>
          </Group>

          <Card shadow="sm" padding="lg" withBorder>
            <Stack gap="sm">
              <Group justify="space-between" wrap="wrap">
                <Group gap="xs">
                  <IconMapPin size={18} />
                  <Text fw={500}>{location?.label ?? 'Aucun lieu sélectionné'}</Text>
                  {isHome && <Badge variant="light">Lieu par défaut</Badge>}
                </Group>
                {location && !isHome && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconStar size={14} />}
                    loading={setHomeMutation.isPending}
                    onClick={() => setHomeMutation.mutate(location)}
                  >
                    Définir comme lieu par défaut
                  </Button>
                )}
              </Group>

              <Group gap="xs" align="flex-end">
                <TextInput
                  placeholder="Rechercher une ville ou un lieu (ex: Annecy, Chamonix...)"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  style={{ flex: 1 }}
                  leftSection={<IconSearch size={16} />}
                />
                <Button onClick={runSearch}>Rechercher</Button>
              </Group>

              {searchResultsQuery.data && searchResultsQuery.data.length > 0 && (
                <Paper withBorder p="xs">
                  <Stack gap={4}>
                    {searchResultsQuery.data.map((r, i) => (
                      <Button
                        key={i}
                        variant="subtle"
                        justify="space-between"
                        fullWidth
                        rightSection={<IconChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />}
                        onClick={() => {
                          const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
                          setLocation({ lat: r.lat, lon: r.lon, label });
                          setSearchQuery('');
                          setSearchInput('');
                        }}
                      >
                        {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
                      </Button>
                    ))}
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Card>

          <WeatherMap markers={mapMarkers} />

          {!location && !homeLocationQuery.isLoading && (
            <Alert icon={<IconAlertCircle size={16} />} color="blue">
              Recherchez un lieu ci-dessus pour afficher ses prévisions.
            </Alert>
          )}

          {forecastQuery.isLoading && location && <Loader />}

          {forecastQuery.isError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red">
              Impossible de récupérer les prévisions météo pour ce lieu.
            </Alert>
          )}

          {hourly.length > 0 && (
            <Card shadow="sm" padding="lg" withBorder>
              <Stack gap="xs">
                <Text fw={500}>Prochaines 48 heures</Text>
                <Group gap="md" wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 4 }}>
                  {hourlyStrip.map((h) => {
                    const meta = weatherMeta(h.weatherCode);
                    const d = new Date(h.time);
                    return (
                      <Stack key={h.time} gap={2} align="center" style={{ minWidth: 56, flexShrink: 0 }}>
                        <Text size="xs" c="dimmed">{String(d.getHours()).padStart(2, '0')}h</Text>
                        {meta.icon}
                        <Text size="xs" fw={500}>{Math.round(h.temperature)}°</Text>
                        <Text size="xs" c="dimmed">{h.precipitationProbability}%</Text>
                      </Stack>
                    );
                  })}
                </Group>
                <OverlayChart series={hourlySeries} height={260} tickFormatter={formatHourTick} />
              </Stack>
            </Card>
          )}

          {daily.length > 0 && (
            <>
              <SimpleGrid cols={{ base: 2, sm: 4, md: 7 }} spacing="sm">
                {daily.map((d) => {
                  const meta = weatherMeta(d.weatherCode);
                  return (
                    <Card key={d.date} shadow="sm" padding="sm" withBorder>
                      <Stack gap={4} align="center">
                        <Text size="xs" c="dimmed" tt="capitalize">
                          {formatDayLabel(d.date)}
                        </Text>
                        {meta.icon}
                        <Text size="xs" ta="center">{meta.label}</Text>
                        <Group gap={4}>
                          <Text fw={600} size="sm">{Math.round(d.tempMax)}°</Text>
                          <Text size="sm" c="dimmed">{Math.round(d.tempMin)}°</Text>
                        </Group>
                        <Group gap={4}>
                          <IconCloudRain size={14} />
                          <Text size="xs" c="dimmed">
                            {d.precipitationProbabilityMax}% · {d.precipitationSum.toFixed(1)}mm
                          </Text>
                        </Group>
                        <Text size="xs" c="dimmed">Vent {Math.round(d.windSpeedMax)} km/h</Text>
                        <Text size="xs" c="dimmed">UV {d.uvIndexMax.toFixed(1)}</Text>
                      </Stack>
                    </Card>
                  );
                })}
              </SimpleGrid>

              <Card shadow="sm" padding="lg" withBorder>
                <Stack gap="xs">
                  <Text fw={500}>Tendance températures et pression</Text>
                  <Text size="xs" c="dimmed">
                    La pression atmosphérique moyenne journalière donne une indication de l'évolution des masses
                    d'air : une pression qui chute annonce souvent l'arrivée d'un temps perturbé, une pression qui
                    monte annonce un temps qui se stabilise.
                  </Text>
                  <OverlayChart series={tempSeries} height={280} />
                </Stack>
              </Card>

              <Card shadow="sm" padding="lg" withBorder>
                <Stack gap="xs">
                  <Text fw={500}>Précipitations cumulées par jour</Text>
                  <ValueChart series={precipSeries} chartType="bar" color={CHART_COLORS[0]} valueKey="precipitation" height={220} />
                </Stack>
              </Card>
            </>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
