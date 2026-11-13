import type { FallbackTransport } from 'viem';
export const FUJI_RPCS: string[];
export function fujiTransport(primary?: string, options?: {timeout?:number;retryCount?:number;urls?:string[]}): FallbackTransport;
export function pollSerial(task:(active:()=>boolean)=>Promise<void>, options?:{delay?:number;maxDelay?:number;schedule?:typeof setTimeout;cancel?:typeof clearTimeout}):()=>void;
