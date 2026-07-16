'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal, PasswordInput, Button, Stack, Text, Center, Loader } from '@mantine/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// La destination du rewrite Next.js (next.config.ts) pointe en dur vers localhost:3001 côté
// serveur — Next ne relaie pas les upgrades WebSocket, donc le navigateur doit se connecter
// directement au port de l'API plutôt que de passer par le proxy /api utilisé pour le reste
// de l'app. À garder synchronisé avec ce port si jamais il change.
const API_PORT = 3001;

type Phase = 'password' | 'connecting' | 'connected' | 'error';

export function TerminalModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('password');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const reset = () => {
    wsRef.current?.close();
    wsRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    setPhase('password');
    setPassword('');
    setErrorMessage(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const connect = () => {
    if (!password) return;
    setPhase('connecting');
    setErrorMessage(null);

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.hostname}:${API_PORT}/api/system/terminal/ws`);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', password }));

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ready') {
        setPhase('connected');
      } else if (msg.type === 'output') {
        termRef.current?.write(msg.data);
      } else if (msg.type === 'error') {
        setErrorMessage(msg.message);
        setPhase('error');
      } else if (msg.type === 'exit') {
        setErrorMessage('Session terminée.');
        setPhase('error');
      }
    };

    ws.onerror = () => {
      setErrorMessage('Connexion impossible au terminal.');
      setPhase('error');
    };

    ws.onclose = () => {
      setPhase((p) => (p === 'connected' ? 'error' : p));
    };
  };

  // Initialise xterm.js une fois que la modale affiche la vue "connected" (le conteneur DOM
  // n'existe qu'à ce moment-là).
  useEffect(() => {
    if (phase !== 'connected' || !containerRef.current || termRef.current) return;

    const term = new Terminal({ cursorBlink: true, fontSize: 13, theme: { background: '#1a1b1e' } });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    term.focus();
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const sendResize = () => {
      fitAddon.fit();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    sendResize();

    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [phase]);

  useEffect(() => {
    if (!opened) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  return (
    <Modal opened={opened} onClose={handleClose} title="Terminal" size="xl" centered>
      {phase === 'password' && (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Accès shell complet au serveur. Le mot de passe est distinct du reste de
            l&apos;application.
          </Text>
          <PasswordInput
            label="Mot de passe du terminal"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && connect()}
            autoFocus
          />
          <Button onClick={connect} disabled={!password}>
            Se connecter
          </Button>
        </Stack>
      )}

      {phase === 'connecting' && (
        <Center h={120}>
          <Loader size="sm" />
        </Center>
      )}

      {phase === 'error' && (
        <Stack gap="sm">
          <Text size="sm" c="red">
            {errorMessage ?? 'Une erreur est survenue.'}
          </Text>
          <Button onClick={reset} variant="light">
            Réessayer
          </Button>
        </Stack>
      )}

      <div
        ref={containerRef}
        style={{ height: 480, display: phase === 'connected' ? 'block' : 'none' }}
      />
    </Modal>
  );
}
