'use client'
import { useState, useEffect, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useStore } from '../lib/store'
import { computeAllMetrics, formatShort } from '../lib/metrics'
import {
  computeLiquidity,
  computeMonthlyObligation,
  computeRunway,
  computeConcentration,
  generateInsights,
} from '../lib/wealthMetrics'

const PORTFOLIO_KEY = 'gd:nav:portfolio-open'

// ── Primitives ────────────────────────────────────────────────────────────────

function GroupLabel({ label }) {
  return (
    <div style={{
      fontSize: 9,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      color: 'var(--color-sidebar-muted)',
      padding: '10px 10px 4px',
    }}>
      {label}
    </div>
  )
}

function Divider() {
  return (
    <div style={{
      height: '0.5px',
      background: 'var(--color-border-tertiary)',
      margin: '6px 2px',
    }} />
  )
}

function NavRow({ isActive, onClick, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        marginBottom: 1,
        background: isActive ? 'var(--color-sidebar-active)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {children}
    </div>
  )
}

function NavLeft({ icon, label, isActive }) {
  const color = isActive ? 'var(--color-sidebar-text)' : 'var(--color-sidebar-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <i
        className={`ti ${icon}`}
        style={{ fontSize: 15, flexShrink: 0, color }}
        aria-hidden="true"
      />
      <span style={{
        fontSize: 13,
        fontWeight: isActive ? 500 : 400,
        color,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
    </div>
  )
}

function ValText({ value, color }) {
  return (
    <span style={{ fontSize: 11, flexShrink: 0, marginLeft: 4, color: color || 'var(--color-sidebar-muted)' }}>
      {value}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Sidebar({ activePage, activeView = 'all', onNavigate }) {
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'
  const { data } = useStore()

  const [portfolioOpen, setPortfolioOpen] = useState(() => {
    try { return localStorage.getItem(PORTFOLIO_KEY) !== 'false' } catch { return true }
  })
  const [memberCount, setMemberCount] = useState(4)

  // Persist expanded state
  useEffect(() => {
    try { localStorage.setItem(PORTFOLIO_KEY, String(portfolioOpen)) } catch {}
  }, [portfolioOpen])

  // Auto-expand when any portfolio child is active
  const isPortfolioChildActive = activePage === 'holdings' || activePage === 'realestate'
  useEffect(() => {
    if (isPortfolioChildActive) setPortfolioOpen(true)
  }, [isPortfolioChildActive])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/users/list')
      .then(r => r.json())
      .then(d => { if (d.users) setMemberCount(d.users.length) })
      .catch(() => {})
  }, [isAdmin])

  const metrics = useMemo(() => computeAllMetrics(data), [data])

  // Insight count for Advisor badge
  const insightCount = useMemo(() => {
    if (!data) return 0
    try {
      const liquidity   = computeLiquidity(data.cashAssets, data.fixedIncome)
      const obligation  = computeMonthlyObligation(data.loans, data.investments, data.insurance)
      const runway      = computeRunway(liquidity, obligation)
      const byCategory  = {
        investments: metrics.investments, gold: metrics.gold,
        realEstate:  metrics.realEstate,  cash: metrics.cash,
        liabilities: metrics.liabilities,
      }
      const concentration = computeConcentration(byCategory, metrics.totalAssets)
      return generateInsights(data, { liquidity, obligation, runway, concentration }).length
    } catch { return 0 }
  }, [data, metrics])

  function go(target) { onNavigate(target) }

  // Active checks
  const portfolioActive = activePage === 'holdings' && activeView === 'all'
  const invActive       = activePage === 'holdings' && activeView === 'investments'
  const goldActive      = activePage === 'holdings' && activeView === 'gold'
  const reActive        = activePage === 'realestate'
  const depActive       = activePage === 'holdings' && activeView === 'deposits'
  const portfolioHeaderHighlight = portfolioActive || isPortfolioChildActive

  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      borderRight: '0.5px solid var(--color-border-secondary)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--color-sidebar-bg)',
    }}>
      {/* ── Logo ── */}
      <div style={{
        padding: '16px 18px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--color-sidebar-text)',
          letterSpacing: '-0.3px',
        }}>
          Grey Diary
        </span>
      </div>

      {/* ── Nav groups ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 10px' }}>

        {/* OVERVIEW */}
        <GroupLabel label="Overview" />
        <NavRow isActive={activePage === 'command'} onClick={() => go('command')}>
          <NavLeft icon="ti-command" label="Command Centre" isActive={activePage === 'command'} />
        </NavRow>

        <Divider />

        {/* ASSETS */}
        <GroupLabel label="Assets" />

        {/* Portfolio dropdown header */}
        <NavRow
          isActive={portfolioActive}
          onClick={() => {
            go({ page: 'holdings', view: 'all' })
            setPortfolioOpen(v => !v)
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <i
              className="ti ti-chart-pie"
              style={{ fontSize: 15, flexShrink: 0, color: portfolioHeaderHighlight ? 'var(--color-sidebar-text)' : 'var(--color-sidebar-muted)' }}
              aria-hidden="true"
            />
            <span style={{
              fontSize: 13,
              fontWeight: portfolioHeaderHighlight ? 500 : 400,
              color: portfolioHeaderHighlight ? 'var(--color-sidebar-text)' : 'var(--color-sidebar-muted)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              Portfolio
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-sidebar-muted)' }}>
              {formatShort(metrics.totalAssets)}
            </span>
            <i
              className="ti ti-chevron-down"
              style={{
                fontSize: 12,
                color: 'var(--color-sidebar-muted)',
                transform: portfolioOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
              aria-hidden="true"
            />
          </div>
        </NavRow>

        {/* Portfolio children — indented 24px with 1px left border */}
        {portfolioOpen && (
          <div style={{
            marginLeft: 12,
            paddingLeft: 12,
            borderLeft: '1px solid var(--color-border-tertiary)',
            marginBottom: 2,
          }}>
            <NavRow isActive={invActive} onClick={() => go({ page: 'holdings', view: 'investments' })}>
              <NavLeft icon="ti-chart-line" label="Investments" isActive={invActive} />
              <ValText value={formatShort(metrics.investments)} />
            </NavRow>

            <NavRow isActive={goldActive} onClick={() => go({ page: 'holdings', view: 'gold' })}>
              <NavLeft icon="ti-coins" label="Gold" isActive={goldActive} />
              <ValText
                value={formatShort(metrics.gold)}
                color={metrics.gold > 0 ? 'var(--color-gold)' : 'var(--color-sidebar-muted)'}
              />
            </NavRow>

            <NavRow isActive={reActive} onClick={() => go('realestate')}>
              <NavLeft icon="ti-building-estate" label="Real Estate" isActive={reActive} />
              <ValText value={formatShort(metrics.realEstate)} />
            </NavRow>

            <NavRow isActive={depActive} onClick={() => go({ page: 'holdings', view: 'deposits' })}>
              <NavLeft icon="ti-cash-banknote" label="Deposits & Cash" isActive={depActive} />
              <ValText value={formatShort(metrics.cash)} />
            </NavRow>
          </div>
        )}

        <Divider />

        {/* LIABILITIES */}
        <GroupLabel label="Liabilities" />
        <NavRow isActive={activePage === 'loans'} onClick={() => go('loans')}>
          <NavLeft icon="ti-credit-card" label="Loans" isActive={activePage === 'loans'} />
          {metrics.liabilities > 0 && (
            <ValText value={formatShort(metrics.liabilities)} color="var(--color-negative)" />
          )}
        </NavRow>

        <Divider />

        {/* PROTECTION */}
        <GroupLabel label="Protection" />
        <NavRow isActive={activePage === 'insurance'} onClick={() => go('insurance')}>
          <NavLeft icon="ti-shield" label="Insurance" isActive={activePage === 'insurance'} />
        </NavRow>

        <Divider />

        {/* PLANNING */}
        <GroupLabel label="Planning" />
        <NavRow isActive={activePage === 'goals'} onClick={() => go('goals')}>
          <NavLeft icon="ti-target" label="Goals" isActive={activePage === 'goals'} />
        </NavRow>

        <Divider />

        {/* INTELLIGENCE */}
        <GroupLabel label="Intelligence" />
        <NavRow isActive={activePage === 'advisor'} onClick={() => go('advisor')}>
          <NavLeft icon="ti-brain" label="Advisor" isActive={activePage === 'advisor'} />
          {insightCount > 0 && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 10,
              background: 'var(--color-warning-bg)',
              color: 'var(--color-warning)',
              flexShrink: 0,
            }}>
              {insightCount}
            </span>
          )}
        </NavRow>
      </div>

      {/* ── Family block (unchanged) ── */}
      <div style={{
        padding: '8px',
        borderTop: '0.5px solid var(--color-border-secondary)',
        flexShrink: 0,
      }}>
        <div
          onClick={() => isAdmin && go('users')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 6,
            cursor: isAdmin ? 'pointer' : 'default',
            background: activePage === 'users' ? 'var(--color-sidebar-active)' : 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--color-accent-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600,
              color: 'var(--color-accent)',
              flexShrink: 0,
            }}>SS</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-sidebar-text)', margin: 0, whiteSpace: 'nowrap' }}>
                Saxena Family
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-sidebar-muted)', margin: 0 }}>
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {isAdmin && (
            <i
              className="ti ti-settings"
              style={{ fontSize: 14, color: 'var(--color-sidebar-muted)', flexShrink: 0 }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  )
}
