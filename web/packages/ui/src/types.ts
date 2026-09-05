export interface Service {
  name: string;
  route: string;
  logo: string;
  desc?: string;
  accent?: string;
  accentBg?: string;
  process?: string;
  port: number;
  managed: boolean;
  maintenance?: boolean;
  enabled?: boolean;
}

export interface ServicesResponse {
  services: Service[];
}

export interface CheckStatus {
  [route: string]: boolean | undefined;
}

export interface BatteryInfo {
  pct?: number | null;
  charging?: boolean;
  status?: string;
  voltage_v?: number | null;
  current_ma?: number | null;
  temp_c?: number | null;
  health?: string;
  tech?: string;
}

export interface CpuInfo {
  pct?: number | null;
  cores?: number | null;
  load1?: number | null;
  load5?: number | null;
  load15?: number | null;
  history?: [number, number][];
}

export interface StorageInfo {
  mount: string;
  used_gb: number;
  total_gb: number;
  pct: number;
}

export interface SystemStatus {
  uptime_s?: number | null;
  battery?: BatteryInfo;
  cpu?: CpuInfo;
  storage?: StorageInfo[];
  history?: [number, number][];
}

export interface ReportService {
  name: string;
  route?: string;
  port?: number | null;
  running?: boolean;
  http_ok?: boolean;
  cpu_pct?: number | null;
  mem_mb?: number | null;
  mem_pct?: number | null;
  procs?: number;
  pids?: number[];
  infra?: boolean;
  discovered?: boolean;
  uptime_s?: number | null;
}

export interface Report {
  ts?: number;
  host?: string;
  total_mb?: number | null;
  avail_mb?: number | null;
  battery?: BatteryInfo;
  services?: ReportService[];
}

export interface ApiResponse<T = unknown> {
  ok?: boolean;
  message?: string;
  error?: string;
  services?: T;
}