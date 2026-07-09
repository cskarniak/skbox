'use client';

import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AlarmWatcher } from '@/components/AlarmWatcher';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <Notifications position="top-right" />
        <AlarmWatcher />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}
