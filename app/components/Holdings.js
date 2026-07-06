'use client'
import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { computeTodayChange } from '../lib/wealthMetrics'
import { formatShort } from '../lib/metrics'
import { formatINR, firstName } from '../lib/format'
import { getMembers } from '../lib/members'

// ── Constants ─────────────────────────────────────────────────────────────

const CLASS_FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'invest',  label: 'Investments' },
  { id: 'gold',    label: 'Gold' },
  { id: 'realty',  label: 'Real Estate' },
  { id: 'fd',      label: 'Fixed Income' },
  { id: 'cash',    label: 'Cash' },
]

const SORT_OPTIONS = [
  { id: 'value', label: 'Value ↓' },
  { id: 'name',  label: 'Name A–Z' },
  { id: 'change', label: 'Today ↓' },
]

// ── Shared style helpers ──────────────────────────────────────────────────

const col = (flex, extra = {}) => ({ flex, minWidth: 0, ...extra })

function Th({ children, flex, align = 'right' }) {
  return (
    <div style={{ flex, textAlign: align, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', padding: '0 6px' }}>
      {children}
    </div>
  )
}

function Td({ children, flex, align = 'right', style = {} }) {
  return (
    <div style={{ flex, textAlign: align, fontSize: 12, color: 'var(--color-text-secondary)', padding: '0 6px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}>
      {children}
    </div>
  )
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      color, background: bg, borderRadius: 3, padding: '1px 4px',
      marginLeft: 5, flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

function ChangeCell({ value }) {
  if (value == null) return <Td flex="0 0 70px">—</Td>
  const color = value >= 0 ? '#10B981' : '#EF4444'
  return (
    <Td flex="0 0 70px" style={{ color, fontWeight: 500 }}>
      {value >= 0 ? '+' : ''}{formatShort(value)}
    </Td>
  )
}

function SectionHeader({ label, count, total }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px 6px',
      borderTop: '0.5px solid var(--color-border-primary)',
      marginTop: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-primary)' }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{count} position{count !== 1 ? 's' : ''}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {formatShort(total)}
      </span>
    </div>
  )
}

// ── Member matching (mirrors metrics.js) ─────────────────────────────────

function matchesMember(item, activeMember) {
  if (!activeMember || activeMember === 'All') return true
  const m = String(item.member || item.memberId || item.owner || '').toLowerCase()
  const search = activeMember.toLowerCase()
  const fn = search.split(' ')[0]
  return m === search || m.includes(fn) || search.includes(m.split(' ')[0])
}

// ── Data normalisation ────────────────────────────────────────────────────

function buildInvestmentRows(investments, activeMember, latestSnap) {
  const filtered = investments.filter(i => matchesMember(i, activeMember))
  const stocks = filtered.filter(i => !i.isMF)
  const mfs    = filtered.filter(i => i.isMF)

  // Group MFs by mfCode
  const mfGroups = {}
  for (const mf of mfs) {
    const key = mf.mfCode || String(mf.id)
    if (!mfGroups[key]) mfGroups[key] = []
    mfGroups[key].push(mf)
  }

  const mfRows = Object.values(mfGroups).map(group => {
    const price      = group[0].currentPrice || group[0].buyPrice || 0
    const totalUnits = group.reduce((s, g) => s + (g.units || 0), 0)
    let totalChange  = 0
    let hasChange    = false
    for (const g of group) {
      const c = computeTodayChange(g, latestSnap)
      if (c != null) { totalChange += c; hasChange = true }
    }
    const isSIP  = group.some(g => g.investmentMode === 'sip')
    const sipInv = isSIP ? group.find(g => g.investmentMode === 'sip') : null
    return {
      key:     `mf-${group[0].mfCode || group[0].id}`,
      name:    group[0].name,
      badge:   'MF',
      isMF:    true,
      members: group.map(g => g.member),
      units:   totalUnits,
      price,
      value:   totalUnits * price,
      todayChange: hasChange ? totalChange : null,
      isSIP,
      sipAmount:    sipInv?.sip?.monthlyAmount || sipInv?.sip?.amount || 0,
      sipFreq:      sipInv?.sip?.frequency || 'Monthly',
      sipDay:       sipInv?.sip?.instalmentDate,
      hasVerify:    group.some(g => (g.flags || []).includes('VERIFY_AMFI')),
      isMulti:      group.length > 1,
      children:     group.length > 1
        ? group.map(g => ({
            member:     g.member,
            units:      g.units || 0,
            value:      (g.units || 0) * price,
            todayChange: computeTodayChange(g, latestSnap),
            isSIP:      g.investmentMode === 'sip',
          }))
        : [],
    }
  })

  const stockRows = stocks.map(s => ({
    key:        `stk-${s.id}`,
    name:       s.name,
    badge:      'STK',
    isMF:       false,
    members:    [s.member],
    units:      s.units || 0,
    price:      s.currentPrice || s.buyPrice || 0,
    value:      (s.units || 0) * (s.currentPrice || s.buyPrice || 0),
    todayChange: computeTodayChange(s, latestSnap),
    isSIP:      false,
    hasVerify:  (s.flags || []).includes('VERIFY_AMFI'),
    isMulti:    false,
    children:   [],
  }))

  return [...mfRows, ...stockRows]
}

// ── Investment rows ────────────────────────────────────────────────────────

function InvestmentRow({ row, expanded, onToggle, members }) {
  const memberMap = Object.fromEntries(members.map(m => [m.name, m]))

  return (
    <>
      <div
        onClick={row.isMulti ? () => onToggle(row.key) : undefined}
        style={{
          display: 'flex', alignItems: 'center',
          padding: '9px 14px',
          borderRadius: 6,
          background: expanded ? 'var(--color-background-tertiary)' : 'transparent',
          cursor: row.isMulti ? 'pointer' : 'default',
          transition: 'background 0.1s',
        }}
      >
        {/* Name */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
          <Badge label={row.badge} color="#7D8590" bg="var(--color-border-primary)" />
          {row.isSIP && <Badge label="SIP" color="#60A5FA" bg="rgba(96,165,250,0.12)" />}
          {row.hasVerify && <Badge label="VERIFY" color="#F59E0B" bg="rgba(245,158,11,0.12)" />}
        </div>

        {/* Member(s) */}
        <Td flex="0 0 90px" align="center">
          {row.isMulti
            ? <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {row.members.length} members {expanded ? '▲' : '▼'}
              </span>
            : <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {firstName(row.members[0] || '')}
              </span>
          }
        </Td>

        {/* Units */}
        <Td flex="0 0 72px">
          {row.units > 0 ? row.units.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}
        </Td>

        {/* Price */}
        <Td flex="0 0 80px">
          {row.price > 0 ? formatShort(row.price) : '—'}
        </Td>

        {/* Value */}
        <Td flex="0 0 80px" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {row.value > 0 ? formatShort(row.value) : '—'}
        </Td>

        {/* Today */}
        <ChangeCell value={row.todayChange} />
      </div>

      {/* SIP sub-line */}
      {row.isSIP && row.sipAmount > 0 && (
        <div style={{ padding: '0 14px 6px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-refresh" style={{ fontSize: 10, color: 'var(--color-text-muted)' }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            {formatShort(row.sipAmount)}/{row.sipFreq?.toLowerCase() || 'mo'}
            {row.sipDay ? ` · ${row.sipDay}th` : ''}
          </span>
        </div>
      )}

      {/* Expanded member breakdown */}
      {expanded && row.children.map((child, i) => {
        const m = memberMap[child.member] || {}
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center',
            padding: '6px 14px 6px 32px',
            borderLeft: `2px solid ${m.color || '#3B82F6'}22`,
            marginLeft: 14,
          }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: m.color || 'var(--color-text-muted)', fontWeight: 600 }}>
                {firstName(child.member)}
              </span>
              {child.isSIP && <Badge label="SIP" color="#60A5FA" bg="rgba(96,165,250,0.12)" />}
            </div>
            <Td flex="0 0 90px" align="center" />
            <Td flex="0 0 72px">
              {child.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
            </Td>
            <Td flex="0 0 80px" />
            <Td flex="0 0 80px" style={{ color: 'var(--color-text-secondary)' }}>
              {formatShort(child.value)}
            </Td>
            <ChangeCell value={child.todayChange} />
          </div>
        )
      })}
    </>
  )
}

// ── Investment section ────────────────────────────────────────────────────

function InvestmentsSection({ rows, sort, members }) {
  const [expanded, setExpanded] = useState({})

  const sorted = useMemo(() => {
    const r = [...rows]
    if (sort === 'name')   r.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'change') r.sort((a, b) => (b.todayChange ?? -Infinity) - (a.todayChange ?? -Infinity))
    else r.sort((a, b) => b.value - a.value)
    return r
  }, [rows, sort])

  if (sorted.length === 0) return null

  const total = sorted.reduce((s, r) => s + r.value, 0)

  function toggle(key) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      <SectionHeader label="Investments" count={sorted.length} total={total} />
      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 6px' }}>
        <Th flex={1} align="left">Name</Th>
        <Th flex="0 0 90px" align="center">Member</Th>
        <Th flex="0 0 72px">Units</Th>
        <Th flex="0 0 80px">Price</Th>
        <Th flex="0 0 80px">Value</Th>
        <Th flex="0 0 70px">Today</Th>
      </div>
      {sorted.map(row => (
        <InvestmentRow
          key={row.key}
          row={row}
          expanded={!!expanded[row.key]}
          onToggle={toggle}
          members={members}
        />
      ))}
    </>
  )
}

// ── Gold section ──────────────────────────────────────────────────────────

function GoldSection({ items, activeMember, goldPrices, sort }) {
  const filtered = items.filter(g => matchesMember(g, activeMember))

  const rows = useMemo(() => {
    const r = filtered.map(g => ({
      ...g,
      price: goldPrices[g.carat] || 0,
      value: (g.grams || 0) * (goldPrices[g.carat] || 0),
    }))
    if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name))
    else r.sort((a, b) => b.value - a.value)
    return r
  }, [filtered, goldPrices, sort])

  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <>
      <SectionHeader label="Gold" count={rows.length} total={total} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 6px' }}>
        <Th flex={1} align="left">Name</Th>
        <Th flex="0 0 70px" align="left">Category</Th>
        <Th flex="0 0 90px" align="center">Member</Th>
        <Th flex="0 0 56px">Grams</Th>
        <Th flex="0 0 40px">Carat</Th>
        <Th flex="0 0 80px">Value</Th>
      </div>
      {rows.map((g, i) => (
        <div key={g.id || i} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px' }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.name}
            {g.category === 'Jewellery' && <Badge label="Jewellery" color="#D4A85A" bg="rgba(212,168,90,0.12)" />}
          </div>
          <Td flex="0 0 70px" align="left">{g.category}</Td>
          <Td flex="0 0 90px" align="center">{firstName(g.member)}</Td>
          <Td flex="0 0 56px">{(g.grams || 0).toFixed(2)}g</Td>
          <Td flex="0 0 40px">{g.carat}K</Td>
          <Td flex="0 0 80px" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatShort(g.value)}</Td>
        </div>
      ))}
    </>
  )
}

// ── Real Estate section ───────────────────────────────────────────────────

function RealEstateSection({ items, activeMember, sort }) {
  const rows = useMemo(() => {
    const filtered = activeMember === 'All'
      ? items
      : items.filter(p => {
          if (matchesMember(p, activeMember)) return true
          return (p.coOwners || []).some(c => matchesMember({ member: c.member }, activeMember))
        })

    const r = filtered.map(p => {
      let value = p.currentValue || 0
      if (activeMember !== 'All') {
        if (matchesMember(p, activeMember)) {
          value = value * ((p.ownershipPct ?? 100) / 100)
        } else {
          const co = (p.coOwners || []).find(c => matchesMember({ member: c.member }, activeMember))
          value = co ? value * ((co.pct || 0) / 100) : 0
        }
      }
      const ownerNames = activeMember !== 'All'
        ? [activeMember]
        : [p.member, ...(p.coOwners || []).map(c => c.member)].filter(Boolean)
      return { ...p, displayValue: value, owners: [...new Set(ownerNames)] }
    })

    if (sort === 'name') r.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else r.sort((a, b) => b.displayValue - a.displayValue)
    return r
  }, [items, activeMember, sort])

  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.displayValue, 0)

  return (
    <>
      <SectionHeader label="Real Estate" count={rows.length} total={total} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 6px' }}>
        <Th flex={1} align="left">Property</Th>
        <Th flex="0 0 140px" align="left">Owners</Th>
        <Th flex="0 0 90px">Current Value</Th>
      </div>
      {rows.map((p, i) => (
        <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px' }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name || p.address || 'Property'}
          </div>
          <Td flex="0 0 140px" align="left" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {p.owners.map(o => firstName(o)).join(' · ')}
          </Td>
          <Td flex="0 0 90px" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatShort(p.displayValue)}</Td>
        </div>
      ))}
    </>
  )
}

// ── Fixed Income section ──────────────────────────────────────────────────

function FixedIncomeSection({ items, activeMember, sort }) {
  const rows = useMemo(() => {
    const filtered = items.filter(f => matchesMember(f, activeMember))
    const r = filtered.map(f => ({ ...f, value: f.maturityValue || f.principal || 0 }))
    if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name))
    else r.sort((a, b) => b.value - a.value)
    return r
  }, [items, activeMember, sort])

  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <>
      <SectionHeader label="Fixed Income" count={rows.length} total={total} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 6px' }}>
        <Th flex={1} align="left">Name</Th>
        <Th flex="0 0 90px" align="center">Member</Th>
        <Th flex="0 0 76px">Principal</Th>
        <Th flex="0 0 80px">Mat. Value</Th>
        <Th flex="0 0 80px">Mat. Date</Th>
        <Th flex="0 0 50px">Rate</Th>
      </div>
      {rows.map((f, i) => (
        <div key={f.id || i} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px' }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.name}
          </div>
          <Td flex="0 0 90px" align="center">{firstName(f.member)}</Td>
          <Td flex="0 0 76px">{formatShort(f.principal || 0)}</Td>
          <Td flex="0 0 80px" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatShort(f.maturityValue || f.principal || 0)}</Td>
          <Td flex="0 0 80px" style={{ fontSize: 11 }}>{f.maturityDate || '—'}</Td>
          <Td flex="0 0 50px">{f.rate ? `${f.rate}%` : '—'}</Td>
        </div>
      ))}
    </>
  )
}

// ── Cash section ──────────────────────────────────────────────────────────

function CashSection({ items, activeMember, sort }) {
  const rows = useMemo(() => {
    const filtered = items.filter(a => matchesMember(a, activeMember))
    const r = [...filtered]
    if (sort === 'name') r.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else r.sort((a, b) => (b.value || 0) - (a.value || 0))
    return r
  }, [items, activeMember, sort])

  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + (r.value || 0), 0)

  return (
    <>
      <SectionHeader label="Cash & Accounts" count={rows.length} total={total} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 6px' }}>
        <Th flex={1} align="left">Account</Th>
        <Th flex="0 0 90px" align="center">Member</Th>
        <Th flex="0 0 90px">Balance</Th>
      </div>
      {rows.map((a, i) => (
        <div key={a.id || i} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px' }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
            {a.name}
          </div>
          <Td flex="0 0 90px" align="center">{firstName(a.member)}</Td>
          <Td flex="0 0 90px" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatShort(a.value || 0)}</Td>
        </div>
      ))}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function Holdings({ activeMember, isReadOnly }) {
  const { data } = useStore()
  const [assetFilter, setAssetFilter] = useState('all')
  const [sort, setSort] = useState('value')

  const latestSnap = useMemo(() => {
    const snaps = data?.snapshots ?? []
    return snaps.length > 0 ? snaps[snaps.length - 1] : null
  }, [data?.snapshots])

  const members = getMembers(data)

  const invRows = useMemo(
    () => buildInvestmentRows(data?.investments ?? [], activeMember, latestSnap),
    [data?.investments, activeMember, latestSnap]
  )

  const goldPrices = data?.goldPrices ?? { 24: 15496, 22: 14205, 18: 9386 }

  const show = (id) => assetFilter === 'all' || assetFilter === id

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto', fontFamily: 'var(--font-sans)' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>
          Holdings
        </h1>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Unified view of all positions
          {activeMember !== 'All' ? ` · ${activeMember}` : ''}
        </p>
      </div>

      {/* Filter strip + sort */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {CLASS_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setAssetFilter(f.id)}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                border: '0.5px solid',
                borderColor: assetFilter === f.id ? 'var(--color-accent)' : 'var(--color-border-primary)',
                background: assetFilter === f.id ? 'var(--color-accent-bg)' : 'transparent',
                color: assetFilter === f.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                fontSize: 12,
                fontWeight: assetFilter === f.id ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{
            padding: '5px 10px',
            borderRadius: 6,
            border: '0.5px solid var(--color-border-primary)',
            background: 'var(--color-background-secondary)',
            color: 'var(--color-text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {/* Sections */}
      <div style={{
        background: 'var(--color-background-secondary)',
        border: '0.5px solid var(--color-border-primary)',
        borderRadius: 10,
        overflow: 'hidden',
        paddingBottom: 8,
      }}>
        {show('invest') && (
          <InvestmentsSection rows={invRows} sort={sort} members={members} />
        )}
        {show('gold') && (
          <GoldSection
            items={data?.gold ?? []}
            activeMember={activeMember}
            goldPrices={goldPrices}
            sort={sort}
          />
        )}
        {show('realty') && (
          <RealEstateSection
            items={data?.realEstate ?? []}
            activeMember={activeMember}
            sort={sort}
          />
        )}
        {show('fd') && (
          <FixedIncomeSection
            items={data?.fixedIncome ?? []}
            activeMember={activeMember}
            sort={sort}
          />
        )}
        {show('cash') && (
          <CashSection
            items={data?.cashAssets ?? []}
            activeMember={activeMember}
            sort={sort}
          />
        )}

        {/* Empty state */}
        {invRows.length === 0 && (data?.gold ?? []).length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
            No holdings to display
          </div>
        )}
      </div>
    </div>
  )
}
