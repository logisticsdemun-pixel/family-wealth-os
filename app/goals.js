'use client'
import { useState, useMemo } from 'react'
import { KEYS } from './lib/storage'
import { formatINR, firstName, MEMBERS } from './lib/format'
import { useStore } from './lib/store'
import PageScaffold from './components/PageScaffold'
import MetricCards from './components/MetricCards'

const GOAL_TYPES = [
  { id: 'retirement', label: 'Retirement',     icon: 'ti-beach'  },
  { id: 'education',  label: 'Child Education', icon: 'ti-school' },
  { id: 'house',      label: 'House Purchase',  icon: 'ti-home'   },
  { id: 'marriage',   label: 'Marriage',        icon: 'ti-heart'  },
  { id: 'vehicle',    label: 'Vehicle',         icon: 'ti-car'    },
  { id: 'travel',     label: 'Travel',          icon: 'ti-plane'  },
  { id: 'custom',     label: 'Custom',          icon: 'ti-target' },
]

const ALL_MEMBERS = [...MEMBERS, 'Family']

// ── Calculation helpers ────────────────────────────────────────

function inflatedTarget(targetAmount, targetDate, inflationPct) {
  const years = Math.max(0,
    (new Date(targetDate) - new Date()) / (365.25 * 24 * 60 * 60 * 1000)
  )
  return targetAmount * Math.pow(1 + inflationPct / 100, years)
}

function linkedCurrentValue(goal, allInvestments, allGold, goldPrices, allCashAccounts) {
  const invValue = (allInvestments || [])
    .filter(h => (goal.linkedInvestmentIds || []).includes(String(h.id)))
    .reduce((s, h) => s + (h.units || 0) * (h.currentPrice || h.buyPrice || 0), 0)

  const goldValue = (allGold || [])
    .filter(g => (goal.linkedGoldIds || []).includes(String(g.id)))
    .reduce((s, g) => {
      const grams = g.grams || 0
      const price = goldPrices[g.carat] || goldPrices[24] || 0
      return s + grams * price
    }, 0)

  const cashValue = (allCashAccounts || [])
    .filter(a => (goal.linkedCashIds || []).includes(String(a.id)))
    .reduce((s, a) => s + (a.value || 0), 0)

  return invValue + goldValue + cashValue
}

function monthlySIPNeeded(currentValue, targetCorpus, targetDate, annualReturnPct) {
  const monthsLeft = Math.max(1,
    Math.round((new Date(targetDate) - new Date()) / (30.44 * 24 * 60 * 60 * 1000))
  )
  const r = annualReturnPct / 100 / 12
  const fvCurrent = currentValue * Math.pow(1 + r, monthsLeft)
  const gap = targetCorpus - fvCurrent
  if (gap <= 0) return 0
  if (r === 0) return gap / monthsLeft
  return Math.max(0, Math.round(gap * r / (Math.pow(1 + r, monthsLeft) - 1)))
}

function goalStatus(fundedPct, monthsLeft) {
  if (fundedPct >= 100) return { label: 'Achieved',        color: 'var(--color-positive)', bg: 'var(--color-positive-bg)' }
  if (monthsLeft <= 0)  return { label: 'Overdue',         color: 'var(--color-negative)', bg: 'var(--color-negative-bg)' }
  if (fundedPct >= 40)  return { label: 'On track',        color: 'var(--color-positive)', bg: 'var(--color-positive-bg)' }
  if (fundedPct >= 15)  return { label: 'Needs attention', color: 'var(--color-warning)',  bg: 'var(--color-warning-bg)' }
  return                       { label: 'Behind',           color: 'var(--color-negative)', bg: 'var(--color-negative-bg)' }
}

function emergencyFundMonths(data, monthlyExpenses) {
  const monthly = monthlyExpenses || 180000
  const cash = (data?.cashAssets || []).reduce((s, a) => s + (a.value || 0), 0)
  const allInv = data?.investments || []
  const debtFunds = allInv
    .filter(h => {
      const t = (h.instrumentType || h.type || '').toLowerCase()
      return t.includes('debt') || t.includes('liquid') ||
             t.includes('savings') || t.includes('short term') ||
             t.includes('ultra short')
    })
    .reduce((s, h) => s + (h.units || 0) * (h.currentPrice || h.buyPrice || 0), 0)
  const fds = (data?.fixedIncome || [])
    .reduce((s, fd) => s + (fd.maturityValue || fd.principal || 0), 0)
  const totalLiquid = cash + debtFunds + fds
  const months = monthly > 0 ? totalLiquid / monthly : 0
  return { totalLiquid, months, monthlyExpenses: monthly }
}

// ── Form styles ────────────────────────────────────────────────

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--color-border-tertiary)',
  backgroundColor: 'var(--color-background-secondary)',
  color: 'var(--color-text-primary)', fontSize: '0.875rem',
  outline: 'none', marginBottom: 10, boxSizing: 'border-box',
}
const lbl = {
  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--color-text-secondary)', margin: '0 0 4px', display: 'block',
}
const btnPrimary = {
  padding: '9px 20px', borderRadius: 8, border: 'none',
  backgroundColor: 'var(--color-accent)', color: '#fff',
  fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
}
const btnGhost = {
  padding: '9px 16px', borderRadius: 8,
  border: '1px solid var(--color-border-tertiary)',
  backgroundColor: 'transparent',
  color: 'var(--color-text-secondary)',
  fontSize: '0.875rem', cursor: 'pointer',
}

// ── GoalForm sub-component ─────────────────────────────────────

function GoalForm({ goal, onSave, onCancel }) {
  const [form, setForm] = useState(() => goal ? {
    name: goal.name || '',
    type: goal.type || 'retirement',
    memberId: goal.memberId || 'Family',
    targetAmount: goal.targetAmount ?? '',
    targetDate: goal.targetDate || '',
    inflationPct: goal.inflationPct ?? 6,
    expectedReturnPct: goal.expectedReturnPct ?? 12,
    notes: goal.notes || '',
  } : {
    name: '', type: 'retirement', memberId: 'Family',
    targetAmount: '', targetDate: '',
    inflationPct: 6, expectedReturnPct: 12, notes: '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      targetAmount: parseFloat(form.targetAmount) || 0,
      inflationPct: parseFloat(form.inflationPct) || 6,
      expectedReturnPct: parseFloat(form.expectedReturnPct) || 12,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={lbl}>Goal name</span>
          <input
            required style={inp} placeholder="e.g. Retirement, Shivansh Education"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <span style={lbl}>Goal type</span>
          <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {GOAL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <span style={lbl}>Member</span>
          <select style={inp} value={form.memberId} onChange={e => setForm({ ...form, memberId: e.target.value })}>
            {ALL_MEMBERS.map(m => <option key={m} value={m}>{firstName(m) || m}</option>)}
          </select>
        </div>
        <div>
          <span style={lbl}>Target amount (today&apos;s ₹)</span>
          <input
            required type="number" style={inp} placeholder="e.g. 20000000"
            value={form.targetAmount} onChange={e => setForm({ ...form, targetAmount: e.target.value })}
          />
        </div>
        <div>
          <span style={lbl}>Target date</span>
          <input
            required type="date" style={inp}
            value={form.targetDate} onChange={e => setForm({ ...form, targetDate: e.target.value })}
          />
        </div>
        <div>
          <span style={lbl}>Inflation % (default 6)</span>
          <input
            type="number" step="0.5" style={inp}
            value={form.inflationPct} onChange={e => setForm({ ...form, inflationPct: e.target.value })}
          />
        </div>
        <div>
          <span style={lbl}>Expected return % (default 12)</span>
          <input
            type="number" step="0.5" style={inp}
            value={form.expectedReturnPct} onChange={e => setForm({ ...form, expectedReturnPct: e.target.value })}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={lbl}>Notes (optional)</span>
          <textarea
            style={{ ...inp, minHeight: 60, resize: 'vertical', marginBottom: 0 }}
            value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button type="submit" style={btnPrimary}>
          {goal ? 'Save Changes' : 'Add Goal'}
        </button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

// ── Main Goals component ───────────────────────────────────────

export default function Goals({ activeMember }) {
  const { data, set } = useStore()

  const [monthlyExpenses, setMonthlyExpenses] = useState(180000)
  const [showForm, setShowForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [showLinkPanel, setShowLinkPanel] = useState(null)

  const goldPrices = data?.goldPrices ?? { 24: 15496, 22: 14205, 18: 9386 }

  const filteredGoals = useMemo(() => {
    const all = data?.goals || []
    if (!activeMember || activeMember === 'All') return all
    return all.filter(g =>
      g.memberId === activeMember ||
      g.memberId === 'Family' ||
      g.memberId.toLowerCase().includes(activeMember.toLowerCase().split(' ')[0])
    )
  }, [data?.goals, activeMember])

  const goalsWithMetrics = useMemo(() =>
    filteredGoals.map(g => {
      const corpus = inflatedTarget(g.targetAmount, g.targetDate, g.inflationPct || 6)
      const current = linkedCurrentValue(g, data?.investments, data?.gold, goldPrices, data?.cashAssets)
      const gap = Math.max(0, corpus - current)
      const fundedPct = corpus > 0 ? Math.min(100, (current / corpus) * 100) : 0
      const monthsLeft = Math.max(0, Math.round(
        (new Date(g.targetDate) - new Date()) / (30.44 * 24 * 60 * 60 * 1000)
      ))
      const sipNeeded = monthlySIPNeeded(current, corpus, g.targetDate, g.expectedReturnPct || 12)
      const status = goalStatus(fundedPct, monthsLeft)
      return { ...g, corpus, current, gap, fundedPct, monthsLeft, sipNeeded, status }
    }),
    [filteredGoals, data?.investments, data?.gold, goldPrices, data?.cashAssets]
  )

  const totalTarget  = goalsWithMetrics.reduce((s, g) => s + g.corpus, 0)
  const totalCurrent = goalsWithMetrics.reduce((s, g) => s + g.current, 0)
  const totalGap     = goalsWithMetrics.reduce((s, g) => s + g.gap, 0)

  const ef = useMemo(() => emergencyFundMonths(data, monthlyExpenses), [data, monthlyExpenses])

  function saveGoals(updated) { set(KEYS.GOALS, updated) }

  function handleSaveGoal(formData) {
    const existing = data?.goals || []
    const goal = {
      ...formData,
      id: editingGoal?.id || String(Date.now()),
      linkedInvestmentIds: editingGoal?.linkedInvestmentIds || [],
      linkedGoldIds: editingGoal?.linkedGoldIds || [],
      linkedCashIds: editingGoal?.linkedCashIds || [],
      createdAt: editingGoal?.createdAt || new Date().toISOString(),
    }
    saveGoals(
      editingGoal
        ? existing.map(g => g.id === goal.id ? goal : g)
        : [...existing, goal]
    )
    setShowForm(false)
    setEditingGoal(null)
  }

  function handleDeleteGoal(id) {
    if (!confirm('Remove this goal?')) return
    saveGoals((data?.goals || []).filter(g => g.id !== id))
  }

  function toggleLink(goalId, itemId, type) {
    const allGoals = data?.goals || []
    const goal = allGoals.find(g => g.id === goalId)
    if (!goal) return
    const field = type === 'investment' ? 'linkedInvestmentIds' : 'linkedGoldIds'
    const current = goal[field] || []
    const sid = String(itemId)
    const updated = current.includes(sid)
      ? current.filter(id => id !== sid)
      : [...current, sid]
    saveGoals(allGoals.map(g => g.id === goalId ? { ...g, [field]: updated } : g))
  }

  function toggleCashLink(goalId, accountId) {
    const allGoals = data?.goals || []
    const goal = allGoals.find(g => g.id === goalId)
    if (!goal) return
    const current = goal.linkedCashIds || []
    const sid = String(accountId)
    const updated = current.includes(sid)
      ? current.filter(id => id !== sid)
      : [...current, sid]
    saveGoals(allGoals.map(g => g.id === goalId ? { ...g, linkedCashIds: updated } : g))
  }

  return (
    <PageScaffold
      title="Goals"
      subtitle={`${goalsWithMetrics.length} goal${goalsWithMetrics.length !== 1 ? 's' : ''} · ${formatINR(totalTarget)} total target`}
      actions={
        <button
          onClick={() => { setEditingGoal(null); setShowForm(true) }}
          style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          + Add Goal
        </button>
      }
    >

      {/* ── Metric cards ──────────────────────────────────── */}
      <MetricCards cards={[
        {
          label: 'TOTAL TARGET CORPUS',
          value: formatINR(totalTarget),
          sub: `Across ${goalsWithMetrics.length} goals`,
          valueColor: 'var(--color-text-primary)',
          subColor: 'var(--color-text-secondary)',
        },
        {
          label: 'ALREADY SAVED',
          value: formatINR(totalCurrent),
          sub: 'From linked investments',
          valueColor: 'var(--color-accent)',
          subColor: 'var(--color-text-secondary)',
        },
        {
          label: 'STILL NEEDED',
          value: formatINR(totalGap),
          sub: 'Gap to reach all goals',
          valueColor: totalGap > 0 ? 'var(--color-negative)' : 'var(--color-positive)',
          subColor: totalGap > 0 ? 'var(--color-negative)' : 'var(--color-positive)',
        },
      ]} />

      {/* ── Emergency fund card ───────────────────────────── */}
      <div style={{
        background: ef.months >= 6 ? 'var(--color-background-secondary)' : ef.months >= 3 ? 'var(--color-warning-bg)' : 'var(--color-negative-bg)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '20px 24px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <i className="ti ti-shield-check" style={{ fontSize: 18, color: ef.months >= 6 ? 'var(--color-positive)' : ef.months >= 3 ? 'var(--color-warning)' : 'var(--color-negative)' }} aria-hidden="true" />
            <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Emergency Fund</p>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 500,
              background: ef.months >= 6 ? 'var(--color-positive-bg)' : ef.months >= 3 ? 'var(--color-warning-bg)' : 'var(--color-negative-bg)',
              color: ef.months >= 6 ? 'var(--color-positive)' : ef.months >= 3 ? 'var(--color-warning)' : 'var(--color-negative)',
            }}>
              {ef.months >= 6 ? 'Healthy' : ef.months >= 3 ? 'Low' : 'Critical'}
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
            Auto-calculated · Cash + debt funds vs monthly expenses
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: ef.months >= 6 ? 'var(--color-positive)' : ef.months >= 3 ? 'var(--color-warning)' : 'var(--color-negative)' }}>
              {ef.months.toFixed(1)}
            </span>
            <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>months covered</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Liquid corpus
          </p>
          <p style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>{formatINR(ef.totalLiquid)}</p>
          <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Monthly expenses
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{formatINR(ef.monthlyExpenses)}</p>
            <button
              onClick={() => {
                const val = prompt('Monthly expenses (₹):', String(monthlyExpenses))
                const n = parseFloat(val)
                if (!isNaN(n) && n > 0) setMonthlyExpenses(n)
              }}
              style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, padding: 0 }}
              title="Edit monthly expenses"
            >✎</button>
          </div>
        </div>
      </div>

      {/* ── Goal cards ────────────────────────────────────── */}
      {goalsWithMetrics.map(goal => {
        const goalType = GOAL_TYPES.find(t => t.id === goal.type) || GOAL_TYPES.find(t => t.id === 'custom')
        const yearsLeft = (goal.monthsLeft / 12).toFixed(1)
        const linkedCount = (goal.linkedInvestmentIds?.length || 0) +
          (goal.linkedGoldIds?.length || 0) +
          (goal.linkedCashIds?.length || 0)

        const linkedParts = []
        if (goal.linkedInvestmentIds?.length > 0)
          linkedParts.push(`${goal.linkedInvestmentIds.length} investment${goal.linkedInvestmentIds.length !== 1 ? 's' : ''}`)
        if (goal.linkedGoldIds?.length > 0)
          linkedParts.push(`${goal.linkedGoldIds.length} gold item${goal.linkedGoldIds.length !== 1 ? 's' : ''}`)
        if (goal.linkedCashIds?.length > 0)
          linkedParts.push(`${goal.linkedCashIds.length} cash account${goal.linkedCashIds.length !== 1 ? 's' : ''}`)

        return (
          <div key={goal.id} style={{
            background: 'var(--color-background-secondary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '20px 24px',
            marginBottom: 16,
          }}>
            {/* Card header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'var(--color-background-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <i className={`ti ${goalType.icon}`} style={{ fontSize: 18, color: 'var(--color-accent)' }} aria-hidden="true" />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 3px', color: 'var(--color-text-primary)' }}>
                    {goal.name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
                    {goal.memberId} · Target {new Date(goal.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} · {yearsLeft} years away
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 500, background: goal.status.bg, color: goal.status.color }}>
                  {goal.status.label}
                </span>
                <button
                  onClick={() => { setEditingGoal(goal); setShowForm(true) }}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '3px 8px' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteGoal(goal.id)}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--color-negative)', cursor: 'pointer', padding: '3px 8px' }}
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Four stat columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Target corpus',      value: formatINR(goal.corpus),  color: 'var(--color-text-primary)' },
                { label: 'Current value',       value: formatINR(goal.current), color: 'var(--color-accent)' },
                { label: 'Gap remaining',       value: formatINR(goal.gap),     color: goal.gap > 0 ? 'var(--color-negative)' : 'var(--color-positive)' },
                { label: 'Monthly SIP needed',  value: goal.sipNeeded > 0 ? formatINR(goal.sipNeeded) : 'Goal reached', color: 'var(--color-text-primary)' },
              ].map((stat, i) => (
                <div key={i}>
                  <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>{stat.label}</p>
                  <p style={{ fontSize: 14, fontWeight: 500, color: stat.color, margin: 0 }}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, background: 'var(--color-background-primary)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%',
                width: `${goal.fundedPct}%`,
                borderRadius: 3,
                background: goal.fundedPct >= 100 ? 'var(--color-positive)' : goal.fundedPct >= 40 ? 'var(--color-accent)' : goal.fundedPct >= 15 ? 'var(--color-warning)' : 'var(--color-negative)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-secondary)' }}>
              <span>{goal.fundedPct.toFixed(1)}% funded</span>
              <span>{formatINR(goal.corpus)} goal</span>
            </div>

            {/* Link footer */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {linkedCount > 0 ? (
                <>
                  <i className="ti ti-link" style={{ fontSize: 13, marginRight: 4 }} aria-hidden="true" />
                  {linkedParts.join(' · ')} linked
                  <button
                    onClick={() => setShowLinkPanel(goal.id)}
                    style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Manage links
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLinkPanel(goal.id)}
                  style={{ fontSize: 12, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  + Link investments to track progress
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* ── Empty state ───────────────────────────────────── */}
      {goalsWithMetrics.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-text-secondary)' }}>
          <i className="ti ti-target" style={{ fontSize: 48, marginBottom: 16, display: 'block' }} aria-hidden="true" />
          <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
            No goals yet
          </p>
          <p style={{ fontSize: 13, margin: '0 0 24px' }}>
            Add your first financial goal to start tracking progress
          </p>
          <button
            onClick={() => { setEditingGoal(null); setShowForm(true) }}
            style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', fontSize: 14, cursor: 'pointer' }}
          >
            + Add your first goal
          </button>
        </div>
      )}

      {/* ── Add / Edit modal ──────────────────────────────── */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div style={{ background: 'var(--color-background-primary)', borderRadius: 16, padding: '28px 32px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                {editingGoal ? 'Edit Goal' : 'Add New Goal'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-text-secondary)' }}
              >
                ×
              </button>
            </div>
            <GoalForm
              goal={editingGoal}
              onSave={handleSaveGoal}
              onCancel={() => { setShowForm(false); setEditingGoal(null) }}
            />
          </div>
        </div>
      )}

      {/* ── Link investments panel ────────────────────────── */}
      {showLinkPanel && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowLinkPanel(null) }}
        >
          <div style={{ background: 'var(--color-background-primary)', borderRadius: 16, padding: '28px 32px', width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>Link investments to goal</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 20px' }}>
              Tick the investments you want to count towards this goal. Their current value will be used to track progress.
            </p>

            {(data?.investments || []).length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>
                  Investments & Mutual Funds
                </p>
                {(data?.investments || []).map(inv => {
                  const goal = (data?.goals || []).find(g => g.id === showLinkPanel)
                  const isLinked = (goal?.linkedInvestmentIds || []).includes(String(inv.id))
                  const currentVal = (inv.units || 0) * (inv.currentPrice || inv.buyPrice || 0)
                  return (
                    <label key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isLinked}
                        onChange={() => toggleLink(showLinkPanel, inv.id, 'investment')}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13 }}>{inv.name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                          {inv.member} · {inv.ticker}
                        </p>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--color-accent)' }}>{formatINR(currentVal)}</span>
                    </label>
                  )
                })}
              </>
            )}

            {(data?.gold || []).length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', margin: '16px 0 8px' }}>
                  Gold
                </p>
                {(data?.gold || []).map(g => {
                  const goal = (data?.goals || []).find(goal => goal.id === showLinkPanel)
                  const isLinked = (goal?.linkedGoldIds || []).includes(String(g.id))
                  const val = (g.grams || 0) * (goldPrices[g.carat] || goldPrices[24] || 0)
                  return (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isLinked}
                        onChange={() => toggleLink(showLinkPanel, g.id, 'gold')}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13 }}>{g.name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                          {g.member} · {g.grams}g · {g.carat}K
                        </p>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--color-accent)' }}>{formatINR(val)}</span>
                    </label>
                  )
                })}
              </>
            )}

            {(data?.cashAssets || []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', margin: '0 0 8px', paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  Cash deposits &amp; accounts
                </p>
                {(data?.cashAssets || []).map(account => {
                  const goal = (data?.goals || []).find(g => g.id === showLinkPanel)
                  const isLinked = (goal?.linkedCashIds || []).includes(String(account.id))
                  return (
                    <label key={account.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isLinked}
                        onChange={() => toggleCashLink(showLinkPanel, account.id)}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-primary)' }}>
                          {account.name || account.bankName || 'Cash Account'}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                          {account.member || ''}{account.type || account.accountType ? ` · ${account.type || account.accountType}` : ''}
                        </p>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--color-accent)', fontWeight: 500 }}>
                        {formatINR(account.value || 0)}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowLinkPanel(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </PageScaffold>
  )
}
