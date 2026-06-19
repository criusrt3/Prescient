import type { PrescientData } from './types'
import { buildDataFallback } from './dataEngine'

const API_PRESCIENT = '/api/prescient'

export async function fetchPrescientData(): Promise<PrescientData> {
  const res = await fetch(API_PRESCIENT, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`Prescient API ${res.status}`)
  }
  return (await res.json()) as PrescientData
}

/** 从 Odaily 代理拉取全量数据（M1–M5 + 简报 + 快讯） */
export async function loadPrescientData(): Promise<PrescientData> {
  try {
    return await fetchPrescientData()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    return buildDataFallback(msg)
  }
}
