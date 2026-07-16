import { Injectable, Logger } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import * as os from 'os';
import { TerminalService } from './terminal.service';

interface ClientMessage {
  type: 'auth' | 'input' | 'resize';
  password?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

const AUTH_TIMEOUT_MS = 15_000;
const TERMINAL_WS_PATH = '/api/system/terminal/ws';

// Serveur WebSocket brut (pas @nestjs/websockets) attaché directement sur le serveur HTTP
// existant : pas de proxy WS via Next.js côté front (ses `rewrites()` ne relaient pas les
// upgrades WebSocket), le navigateur se connecte donc ici en direct sur le port de l'API.
@Injectable()
export class TerminalWsService {
  private readonly logger = new Logger(TerminalWsService.name);

  constructor(private readonly terminal: TerminalService) {}

  attach(server: HttpServer): void {
    const wss = new WebSocketServer({ server, path: TERMINAL_WS_PATH });
    wss.on('connection', (ws) => this.handleConnection(ws));
    this.logger.log(`Terminal WebSocket server attaché sur ${TERMINAL_WS_PATH}`);
  }

  private handleConnection(ws: WebSocket): void {
    const session: { authenticated: boolean; ptyProcess: pty.IPty | null } = {
      authenticated: false,
      ptyProcess: null,
    };

    const authTimer = setTimeout(() => {
      if (!session.authenticated) {
        this.send(ws, { type: 'error', message: 'Authentification expirée.' });
        ws.close();
      }
    }, AUTH_TIMEOUT_MS);

    // Le handler complet est enveloppé dans un try/catch : une exception non rattrapée ici
    // (même synchrone, ex: pty.spawn) deviendrait une rejection de promesse non gérée puisque
    // le handler est async, ce qui fait planter tout le process API sous Node par défaut — une
    // session terminal buggée ne doit couper que cette session, jamais le reste de l'app.
    ws.on('message', async (raw) => {
      try {
        await this.handleMessage(ws, raw, session, authTimer);
      } catch (err: any) {
        this.logger.error(`Erreur dans la session terminal: ${err.message}`);
        this.send(ws, { type: 'error', message: 'Erreur interne du terminal.' });
        ws.close();
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      session.ptyProcess?.kill();
    });
  }

  private async handleMessage(
    ws: WebSocket,
    raw: unknown,
    session: { authenticated: boolean; ptyProcess: pty.IPty | null },
    authTimer: ReturnType<typeof setTimeout>,
  ): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (!session.authenticated) {
      if (msg.type !== 'auth') return;

      let ok: boolean;
      try {
        ok = await this.terminal.verifyPassword(msg.password ?? '');
      } catch (err: any) {
        this.send(ws, { type: 'error', message: err.message });
        ws.close();
        return;
      }
      if (!ok) {
        this.send(ws, { type: 'error', message: 'Mot de passe incorrect.' });
        ws.close();
        return;
      }

      session.authenticated = true;
      clearTimeout(authTimer);

      // pty.spawn peut lever de façon synchrone (posix_spawn échoué, shell introuvable...) :
      // ne jamais laisser une session qui échoue faire planter tout le process API.
      try {
        session.ptyProcess = pty.spawn('/bin/bash', ['--login'], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: os.homedir(),
          env: process.env as { [key: string]: string },
        });
      } catch (err: any) {
        this.logger.error(`Échec du lancement du shell: ${err.message}`);
        this.send(ws, { type: 'error', message: 'Impossible de lancer le shell sur le serveur.' });
        ws.close();
        return;
      }

      session.ptyProcess.onData((data) => this.send(ws, { type: 'output', data }));
      session.ptyProcess.onExit(({ exitCode }) => {
        this.send(ws, { type: 'exit', code: exitCode });
        ws.close();
      });
      this.send(ws, { type: 'ready' });
      return;
    }

    if (!session.ptyProcess) return;
    if (msg.type === 'input' && typeof msg.data === 'string') {
      session.ptyProcess.write(msg.data);
    } else if (msg.type === 'resize' && msg.cols && msg.rows) {
      session.ptyProcess.resize(msg.cols, msg.rows);
    }
  }

  private send(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}
