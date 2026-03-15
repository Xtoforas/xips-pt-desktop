import { z } from 'zod';

export const lifecyclePhaseSchema = z.enum([
  'queued',
  'processing',
  'refresh_pending',
  'refreshing',
  'complete',
  'failed',
  'skipped_duplicate'
]);

export type UploadLifecyclePhase = z.infer<typeof lifecyclePhaseSchema>;

export const roleSchema = z.enum(['regular', 'premium', 'admin']);
export type UserRole = z.infer<typeof roleSchema>;

export const sessionUserSchema = z.object({
  userId: z.string(),
  discordId: z.string(),
  displayName: z.string(),
  role: roleSchema
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

export const serviceHealthSchema = z.object({
  ok: z.boolean(),
  service: z.string().optional(),
  queueDepth: z.number().optional(),
  failedJobs: z.number().optional(),
  timestamp: z.string().optional()
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const tournamentFormatSchema = z.object({
  id: z.string(),
  name: z.string(),
  gameVersion: z.literal('ootp27'),
  formatType: z.string().default(''),
  runEnvironment: z.string().default(''),
  parkKey: z.string().default(''),
  mode: z.string().default(''),
  capValue: z.string().default(''),
  variantLimitValue: z.string().default(''),
  ovrRestrictions: z.array(z.string()).default([]),
  eraRestrictions: z.array(z.string()).default([]),
  cardTypeRestrictions: z.array(z.string()).default([])
});

export type TournamentFormat = z.infer<typeof tournamentFormatSchema>;

export const formatsResponseSchema = z.object({
  ok: z.boolean(),
  rows: z.array(tournamentFormatSchema).default([])
});

export type FormatsResponse = z.infer<typeof formatsResponseSchema>;

export const uploadRecordSchema = z.object({
  id: z.string(),
  fileKind: z.enum(['stats_export', 'card_catalog']).default('stats_export'),
  gameVersion: z.literal('ootp27').default('ootp27'),
  status: z.string().default('queued'),
  error: z.string().default(''),
  importedAt: z.string().default(''),
  rowCount: z.number().default(0),
  queuedAt: z.string().optional(),
  processingAt: z.string().optional(),
  parsedAt: z.string().optional(),
  refreshingAt: z.string().optional(),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  lifecyclePhase: lifecyclePhaseSchema.default('queued'),
  duplicateOfUploadId: z.string().optional(),
  contextJson: z.record(z.string(), z.string()).default({})
});

export type UploadRecord = z.infer<typeof uploadRecordSchema>;

export const uploadsResponseSchema = z.object({
  ok: z.boolean(),
  rows: z.array(uploadRecordSchema).default([])
});

export type UploadsResponse = z.infer<typeof uploadsResponseSchema>;

export const uploadDetailResponseSchema = z.object({
  ok: z.boolean(),
  row: uploadRecordSchema
});

export type UploadDetailResponse = z.infer<typeof uploadDetailResponseSchema>;

export const uploadCreateResponseSchema = z.object({
  ok: z.boolean(),
  uploadId: z.string(),
  status: z.string(),
  skipped: z.boolean(),
  checksum: z.string()
});

export type UploadCreateResponse = z.infer<typeof uploadCreateResponseSchema>;

export const duplicateCheckResponseSchema = z.object({
  ok: z.boolean(),
  duplicate: z.boolean(),
  uploadId: z.string().default(''),
  reason: z.string().default('')
});

export type DuplicateCheckResponse = z.infer<typeof duplicateCheckResponseSchema>;

const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const primitiveArraySchema = z.array(primitiveSchema);
const valueSchema = z.union([primitiveSchema, primitiveArraySchema]);

export const cardsResponseSchema = z.object({
  ok: z.boolean(),
  source: z.enum(['user', 'admin']).optional(),
  rows: z.array(
    z.object({
      cardId: z.number(),
      playerName: z.string(),
      overall: z.number(),
      tier: z.number(),
      updatedAt: z.string().optional()
    })
  ).default([])
});

export type CardsResponse = z.infer<typeof cardsResponseSchema>;

export const myAggResponseSchema = z.object({
  ok: z.boolean(),
  cards: z.array(z.record(z.string(), valueSchema)).default([]),
  teams: z.array(z.record(z.string(), valueSchema)).default([])
});

export type MyAggResponse = z.infer<typeof myAggResponseSchema>;

export const meResponseSchema = z.object({
  ok: z.boolean(),
  user: sessionUserSchema
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const desktopExchangeResponseSchema = z.object({
  ok: z.boolean(),
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresAt: z.string(),
  user: sessionUserSchema
});

export type DesktopExchangeResponse = z.infer<typeof desktopExchangeResponseSchema>;

export type LocalServerProfile = {
  id: string;
  name: string;
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalWatchRoot = {
  id: string;
  profileId: string;
  path: string;
  recursive: boolean;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocalDiagnosticEvent = {
  id: string;
  level: 'info' | 'warn' | 'error';
  category: 'auth' | 'watcher' | 'queue' | 'uploads' | 'polling' | 'api' | 'storage';
  message: string;
  detail: string;
  createdAt: string;
};

export type LocalUploadJob = {
  id: string;
  profileId: string;
  filename: string;
  path: string;
  fileKind: 'stats_export' | 'card_catalog';
  localState:
    | 'detected'
    | 'awaiting_format_assignment'
    | 'queued_local'
    | 'duplicate_skipped_local'
    | 'uploading'
    | 'uploaded_waiting_server'
    | 'server_queued'
    | 'server_processing'
    | 'server_refresh_pending'
    | 'server_refreshing'
    | 'complete'
    | 'failed_retryable'
    | 'failed_terminal'
    | 'auth_blocked';
  lifecyclePhase: UploadLifecyclePhase | null;
  checksum: string;
  formatId: string;
  uploadId: string;
  error: string;
  retries: number;
  createdAt: string;
  updatedAt: string;
};

export type DesktopSnapshot = {
  profiles: LocalServerProfile[];
  selectedProfileId: string;
  authUser: SessionUser | null;
  tokenExpiresAt: string;
  watchRoots: LocalWatchRoot[];
  uploadJobs: LocalUploadJob[];
  diagnostics: LocalDiagnosticEvent[];
  cachedFormats: TournamentFormat[];
};
