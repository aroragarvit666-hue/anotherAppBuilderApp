/*
 * Adobe Analytics dashboard action.
 *
 * Two modes in one action:
 *   - No `rsid` param  -> returns the list of available report suites (for the Picker).
 *   - `rsid` + `startDate` + `endDate` -> runs a daily metrics report.
 */

const fetch = require('node-fetch')
const { Core } = require('@adobe/aio-sdk')
const { generateAccessToken } = require('@adobe/aio-lib-core-auth')
const sdk = require('@adobe/aio-lib-analytics')

// Discover the Analytics globalCompanyId for this org
async function getGlobalCompanyId (accessToken, apiKey) {
  const res = await fetch('https://analytics.adobe.io/discovery/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': apiKey
    }
  })
  if (!res.ok) {
    throw new Error(`discovery/me failed with status ${res.status}`)
  }
  const { imsOrgs } = await res.json()
  const companies = imsOrgs?.[0]?.companies
  if (!companies || companies.length === 0) {
    throw new Error('No Analytics companies found for this organization')
  }
  return companies[0].globalCompanyId
}

async function main (params) {
  const logger = Core.Logger('analytics', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Analytics action invoked')

    if (!params.apiKey) {
      return { statusCode: 400, body: { error: 'Missing apiKey — check $SERVICE_API_KEY wiring' } }
    }

    // 1) Access token (S2S credentials injected via include-ims-credentials)
    const tokenResponse = await generateAccessToken(params)
    const accessToken = tokenResponse.access_token

    // 2) Discover company + init SDK
    const globalCompanyId = await getGlobalCompanyId(accessToken, params.apiKey)
    const analyticsClient = await sdk.init(globalCompanyId, params.apiKey, accessToken)

    // MODE A: no rsid -> list report suites
    if (!params.rsid) {
      logger.info('Fetching report suites')
      const res = await analyticsClient.getCollections({ limit: 100 })
      const suites = (res.body?.content || []).map((s) => ({ rsid: s.rsid, name: s.name }))
      return { statusCode: 200, body: { suites } }
    }

    // MODE B: rsid + dates -> run report
    const missing = ['startDate', 'endDate'].filter((p) => !params[p])
    if (missing.length > 0) {
      return { statusCode: 400, body: { error: `Missing required params: ${missing.join(', ')}` } }
    }

    logger.info(`Running report for rsid=${params.rsid}`)
    const dateRange = `${params.startDate}T00:00:00.000/${params.endDate}T00:00:00.000`

    const reportBody = {
      rsid: params.rsid,
      globalFilters: [
        { type: 'dateRange', dateRange }
      ],
      metricContainer: {
        metrics: [
          { columnId: '0', id: 'metrics/pageviews' },
          { columnId: '1', id: 'metrics/visits' },
          { columnId: '2', id: 'metrics/visitors' }
        ]
      },
      dimension: 'variables/daterangeday',
      settings: { limit: 400, page: 0, nonesBehavior: 'exclude-nones' }
    }

    const res = await analyticsClient.getReport(reportBody)
    const report = res.body || {}

    // Shape rows into a UI-friendly structure
    const rows = (report.rows || []).map((r) => ({
      date: r.value,
      pageviews: r.data?.[0] ?? 0,
      visits: r.data?.[1] ?? 0,
      visitors: r.data?.[2] ?? 0
    }))

    const totals = report.summaryData?.totals || []
    const summary = {
      pageviews: totals[0] ?? rows.reduce((a, r) => a + r.pageviews, 0),
      visits: totals[1] ?? rows.reduce((a, r) => a + r.visits, 0),
      visitors: totals[2] ?? rows.reduce((a, r) => a + r.visitors, 0)
    }

    logger.info(`Report returned ${rows.length} rows`)
    return { statusCode: 200, body: { rows, summary } }
  } catch (error) {
    logger.error('Analytics action failed:', error.message)
    return { statusCode: 500, body: { error: error.message } }
  }
}

exports.main = main
