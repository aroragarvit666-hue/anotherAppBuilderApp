/*
 * Tests for the analytics action.
 */

jest.mock('node-fetch')
jest.mock('@adobe/aio-lib-core-auth', () => ({
  generateAccessToken: jest.fn()
}))
jest.mock('@adobe/aio-lib-analytics', () => ({
  init: jest.fn()
}))
jest.mock('@adobe/aio-sdk', () => ({
  Core: { Logger: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), error: jest.fn() })) }
}))

const fetch = require('node-fetch')
const { generateAccessToken } = require('@adobe/aio-lib-core-auth')
const sdk = require('@adobe/aio-lib-analytics')
const { main } = require('../actions/analytics/index.js')

const baseParams = { apiKey: 'fake-key' }

function mockDiscoveryOk () {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ imsOrgs: [{ companies: [{ globalCompanyId: 'gco123' }] }] })
  })
}

describe('analytics action', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    generateAccessToken.mockResolvedValue({ access_token: 'token123' })
  })

  it('returns 400 when apiKey is missing', async () => {
    const res = await main({})
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toContain('apiKey')
  })

  it('returns 200 with report suites when no rsid provided', async () => {
    mockDiscoveryOk()
    sdk.init.mockResolvedValue({
      getCollections: jest.fn().mockResolvedValue({
        body: { content: [{ rsid: 'rs1', name: 'Suite One' }] }
      })
    })

    const res = await main(baseParams)
    expect(res.statusCode).toBe(200)
    expect(res.body.suites).toEqual([{ rsid: 'rs1', name: 'Suite One' }])
  })

  it('returns 400 when rsid provided without dates', async () => {
    mockDiscoveryOk()
    sdk.init.mockResolvedValue({})
    const res = await main({ ...baseParams, rsid: 'rs1' })
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toContain('Missing required params')
  })

  it('returns 200 with report rows when rsid + dates provided', async () => {
    mockDiscoveryOk()
    sdk.init.mockResolvedValue({
      getReport: jest.fn().mockResolvedValue({
        body: {
          rows: [{ value: '2024-01-01', data: [10, 5, 4] }],
          summaryData: { totals: [10, 5, 4] }
        }
      })
    })

    const res = await main({ ...baseParams, rsid: 'rs1', startDate: '2024-01-01', endDate: '2024-01-08' })
    expect(res.statusCode).toBe(200)
    expect(res.body.rows).toEqual([{ date: '2024-01-01', pageviews: 10, visits: 5, visitors: 4 }])
    expect(res.body.summary).toEqual({ pageviews: 10, visits: 5, visitors: 4 })
  })

  it('returns 500 on SDK failure', async () => {
    mockDiscoveryOk()
    sdk.init.mockRejectedValue(new Error('boom'))
    const res = await main(baseParams)
    expect(res.statusCode).toBe(500)
    expect(res.body.error).toBe('boom')
  })
})
