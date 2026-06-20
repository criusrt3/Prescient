import type { CryptoOpportunitiesData, PrescientData } from './types'
import { pickBriefingTopOpportunities } from './types'
import { buildDataFallback } from './dataEngine'

const API_PRESCIENT = '/api/prescient'
const API_OPPORTUNITIES = '/api/opportunities'

export async function fetchPrescientData(): Promise<PrescientData> {
  const res = await fetch(API_PRESCIENT, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`Prescient API ${res.status}`)
  }
  return (await res.json()) as PrescientData
}

export async function fetchOpportunitiesData(): Promise<CryptoOpportunitiesData> {
  const res = await fetch(API_OPPORTUNITIES, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`Opportunities API ${res.status}`)
  }
  return (await res.json()) as CryptoOpportunitiesData
}

function mergeOpportunities(main: PrescientData, opportunities: CryptoOpportunitiesData | null): PrescientData {
  if (!opportunities) return main
  return {
    ...main,
    opportunities,
    briefing: {
      ...main.briefing,
      topOpportunities: pickBriefingTopOpportunities(opportunities),
    },
  }
}

/** 先拉 RSS 主数据（快），币圈机会由 loadOpportunitiesInto 单独深度拉取 */
export async function loadPrescientData(): Promise<PrescientData> {
  try {
    return await fetchPrescientData()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    return buildDataFallback(msg)
  }
}

/** 币圈机会独立深度接口（近 4 个月 Odaily Web API） */
export async function loadOpportunitiesInto(main: PrescientData): Promise<PrescientData> {
  try {
    const opportunities = await fetchOpportunitiesData()
    return mergeOpportunities(main, opportunities)
  } catch {
    return main
  }
}
