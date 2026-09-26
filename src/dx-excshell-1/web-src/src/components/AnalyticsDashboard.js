/*
 * Adobe Analytics dashboard tab.
 * 1. On load: fetch report suites -> populate a Picker.
 * 2. Select a suite + date range -> Load Report.
 * 3. Display summary metrics + daily breakdown table.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Flex,
  View,
  Heading,
  Content,
  Text,
  Picker,
  Item,
  Button,
  ProgressCircle,
  InlineAlert,
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
  IllustratedMessage,
  Divider
} from '@adobe/react-spectrum'
import NotFound from '@spectrum-icons/illustrations/NotFound'
import actions from '../config.json'

const DATE_RANGES = [
  { id: '7', name: 'Last 7 days' },
  { id: '30', name: 'Last 30 days' },
  { id: '90', name: 'Last 90 days' }
]

// Returns { startDate, endDate } as YYYY-MM-DD (endDate = today, exclusive-ish window)
function computeDateRange (days) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - Number(days))
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { startDate: fmt(start), endDate: fmt(end) }
}

async function invokeAction (url, ims, body) {
  if (!url) return null
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ims.token}`,
      'x-gw-ims-org-id': ims.org
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Action failed: ${res.status}`)
  return res.json()
}

function MetricCard ({ label, value }) {
  return (
    <View
      backgroundColor='gray-100'
      borderRadius='medium'
      padding='size-200'
      minWidth='size-2000'
    >
      <Flex direction='column' gap='size-50'>
        <Text UNSAFE_style={{ fontSize: '0.85rem', color: 'var(--spectrum-global-color-gray-700)' }}>
          {label}
        </Text>
        <Text UNSAFE_style={{ fontSize: '1.75rem', fontWeight: 700 }}>
          {Number(value || 0).toLocaleString()}
        </Text>
      </Flex>
    </View>
  )
}

function AnalyticsDashboard ({ ims }) {
  const analyticsUrl = actions.analytics

  const [suites, setSuites] = useState([])
  const [selectedSuite, setSelectedSuite] = useState(null)
  const [selectedRange, setSelectedRange] = useState('7')

  const [loadingSuites, setLoadingSuites] = useState(true)
  const [suitesError, setSuitesError] = useState(null)

  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [reportError, setReportError] = useState(null)

  // 1) Load report suites on mount
  const loadSuites = useCallback(async () => {
    if (!analyticsUrl) {
      setLoadingSuites(false)
      setSuitesError('Backend action not available yet. Deploy the app (aio app deploy) or run it locally (aio app run) to load report suites.')
      return
    }
    setLoadingSuites(true)
    setSuitesError(null)
    try {
      const data = await invokeAction(analyticsUrl, ims, {})
      if (data?.error) throw new Error(data.error)
      setSuites(data?.suites || [])
    } catch (e) {
      setSuitesError(e.message)
    } finally {
      setLoadingSuites(false)
    }
  }, [analyticsUrl, ims])

  useEffect(() => {
    loadSuites()
  }, [loadSuites])

  // 2) Load report on button click
  async function handleLoadReport () {
    if (!selectedSuite) return
    setLoadingReport(true)
    setReportError(null)
    setReport(null)
    try {
      const { startDate, endDate } = computeDateRange(selectedRange)
      const data = await invokeAction(analyticsUrl, ims, {
        rsid: selectedSuite,
        startDate,
        endDate
      })
      if (data?.error) throw new Error(data.error)
      setReport(data)
    } catch (e) {
      setReportError(e.message)
    } finally {
      setLoadingReport(false)
    }
  }

  return (
    <View>
      <Heading level={1}>Adobe Analytics Dashboard</Heading>
      <Content>
        <Text>Select a report suite and date range to view traffic metrics.</Text>
      </Content>

      <View marginTop='size-300'>
        {loadingSuites ? (
          <Flex alignItems='center' gap='size-150' height='size-600'>
            <ProgressCircle aria-label='Loading report suites' isIndeterminate size='M' />
            <Text>Loading report suites…</Text>
          </Flex>
        ) : suitesError ? (
          <InlineAlert variant='negative'>
            <Heading>Could not load report suites</Heading>
            <Content>{suitesError}</Content>
          </InlineAlert>
        ) : (
          <Flex direction='row' gap='size-200' alignItems='end' wrap>
            <Picker
              label='Report suite'
              placeholder='Select a report suite'
              items={suites}
              selectedKey={selectedSuite}
              onSelectionChange={(key) => setSelectedSuite(key)}
              minWidth='size-3000'
            >
              {(item) => <Item key={item.rsid}>{item.name}</Item>}
            </Picker>

            <Picker
              label='Date range'
              items={DATE_RANGES}
              selectedKey={selectedRange}
              onSelectionChange={(key) => setSelectedRange(key)}
              minWidth='size-2000'
            >
              {(item) => <Item key={item.id}>{item.name}</Item>}
            </Picker>

            <Button
              variant='accent'
              onPress={handleLoadReport}
              isDisabled={!selectedSuite}
              isPending={loadingReport}
            >
              Load Report
            </Button>
          </Flex>
        )}
      </View>

      <Divider size='S' marginTop='size-300' marginBottom='size-300' />

      {/* 3) Report display */}
      {loadingReport ? (
        <Flex alignItems='center' justifyContent='center' height='size-3000'>
          <ProgressCircle aria-label='Loading report' isIndeterminate size='L' />
        </Flex>
      ) : reportError ? (
        <InlineAlert variant='negative'>
          <Heading>Error loading report</Heading>
          <Content>{reportError}</Content>
        </InlineAlert>
      ) : report ? (
        <ReportView report={report} />
      ) : (
        <IllustratedMessage>
          <NotFound />
          <Heading>No report loaded</Heading>
          <Content>Select a report suite and date range, then click Load Report.</Content>
        </IllustratedMessage>
      )}
    </View>
  )
}

function ReportView ({ report }) {
  const rows = report.rows || []
  const summary = report.summary || {}

  return (
    <Flex direction='column' gap='size-300'>
      <Flex direction='row' gap='size-200' wrap>
        <MetricCard label='Page Views' value={summary.pageviews} />
        <MetricCard label='Visits' value={summary.visits} />
        <MetricCard label='Visitors' value={summary.visitors} />
      </Flex>

      <TableView aria-label='Daily analytics metrics' height='size-4600'>
        <TableHeader>
          <Column key='date'>Date</Column>
          <Column key='pageviews' align='end'>Page Views</Column>
          <Column key='visits' align='end'>Visits</Column>
          <Column key='visitors' align='end'>Visitors</Column>
        </TableHeader>
        <TableBody
          items={rows.map((r, i) => ({ id: i, ...r }))}
          renderEmptyState={() => (
            <IllustratedMessage>
              <NotFound />
              <Heading>No data</Heading>
              <Content>No metrics returned for this date range.</Content>
            </IllustratedMessage>
          )}
        >
          {(item) => (
            <Row key={item.id}>
              <Cell>{item.date}</Cell>
              <Cell>{Number(item.pageviews).toLocaleString()}</Cell>
              <Cell>{Number(item.visits).toLocaleString()}</Cell>
              <Cell>{Number(item.visitors).toLocaleString()}</Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
    </Flex>
  )
}

export default AnalyticsDashboard
