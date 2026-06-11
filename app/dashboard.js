'use client'
import { useState, useEffect } from 'react'

const LIABILITY_TYPES = [
  'Home Loan',
  'Car Loan',
  'Personal Loan',
  'Credit Card',
  'Education Loan',
  'Other Debt'
]
const ASSET_TYPES = [
  'Cash & Savings',
  'Fixed Deposits',
  'Stocks',
  'Mutual Funds',
  'Gold',
  'EPF / PPF',
  'Real Estate',
  'Crypto',
  'Other'
]

export default function Dashboard() {
  const [assets, setAssets] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [liabilities, setLiabilities] = useState([])
  const [showLiabilityForm, setShowLiabilityForm] = useState(false)
  const [liabilityName, setLiabilityName] = useState('')
  const [liabilityType, setLiabilityType] = useState(LIABILITY_TYPES[0])
  const [liabilityValue, setLiabilityValue] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState(ASSET_TYPES[0])
  const [value, setValue] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('fwos-assets')
    if (saved) setAssets(JSON.parse(saved))
    const savedL = localStorage.getItem('fwos-liabilities')
    if (savedL) setLiabilities(JSON.parse(savedL))
  }, [])

  function saveLiabilities(updated) {
    setLiabilities(updated)
    localStorage.setItem('fwos-liabilities', JSON.stringify(updated))
  }

  function handleAddLiability(e) {
    e.preventDefault()
    const newLiability = {
      id: Date.now(),
      name: liabilityName,
      type: liabilityType,
      value: parseFloat(liabilityValue)
    }
    saveLiabilities([...liabilities, newLiability])
    setLiabilityName('')
    setLiabilityType(LIABILITY_TYPES[0])
    setLiabilityValue('')
    setShowLiabilityForm(false)
  }

  function handleDeleteLiability(id) {
    saveLiabilities(liabilities.filter(l => l.id !== id))
  }

  function handleEditLiability(id, newValue) {
    saveLiabilities(liabilities.map(l =>
      l.id === id ? { ...l, value: parseFloat(newValue) } : l
    ))
  }

  function handleAdd(e) {
    e.preventDefault()
    const newAsset = {
      id: Date.now(),
      name,
      type,
      value: parseFloat(value)
    }
    saveAssets([...assets, newAsset])
    setName('')
    setType(ASSET_TYPES[0])
    setValue('')
    setShowForm(false)
  }

  function handleDelete(id) {
    saveAssets(assets.filter(a => a.id !== id))
  }

  function handleEdit(id, newValue) {
    saveAssets(assets.map(a => 
      a.id === id ? { ...a, value: parseFloat(newValue) } : a
    ))
  }

  const totalAssets = assets.reduce((sum, a) => sum + a.value, 0)
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.value, 0)
  const totalNetWorth = totalAssets - totalLiabilities

  const byType = ASSET_TYPES.map(t => ({
    type: t,
    total: assets.filter(a => a.type === t).reduce((sum, a) => sum + a.value, 0)
  })).filter(t => t.total > 0)

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: 'white',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
    marginBottom: '12px'
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      fontFamily: 'sans-serif',
      color: 'white',
      padding: '32px 24px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Family Wealth OS</h1>
          <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>Net Worth Dashboard</p>
        </div>

        {/* Net Worth Card */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '8px' }}>
            TOTAL NET WORTH
          </p>
          <h2 style={{ fontSize: '3rem', margin: 0, color: '#6366f1' }}>
            {formatINR(totalNetWorth)}
          </h2>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            marginTop: '16px'
          }}>
            <div>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>TOTAL ASSETS</p>
              <p style={{ color: '#22c55e', fontSize: '1.1rem', margin: '4px 0 0' }}>
                {formatINR(totalAssets)}
              </p>
            </div>
            <div>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>TOTAL LIABILITIES</p>
              <p style={{ color: '#ef4444', fontSize: '1.1rem', margin: '4px 0 0' }}>
                {formatINR(totalLiabilities)}
              </p>
            </div>
          </div>
        </div>

        {/* Breakdown by type */}
        {byType.length > 0 && (
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: '#94a3b8' }}>
              BREAKDOWN BY TYPE
            </h3>
            {byType.map(t => (
              <div key={t.type} style={{ marginBottom: '14px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '6px',
                  fontSize: '0.9rem'
                }}>
                  <span>{t.type}</span>
                  <span style={{ color: '#6366f1' }}>{formatINR(t.total)}</span>
                </div>
                <div style={{
                  height: '6px',
                  backgroundColor: '#0f172a',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(t.total / totalNetWorth) * 100}%`,
                    backgroundColor: '#6366f1',
                    borderRadius: '4px'
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Asset List */}
        {assets.length > 0 && (
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: '#94a3b8' }}>
              ALL ASSETS
            </h3>
            {assets.map(asset => (
              <div key={asset.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px solid #334155'
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>{asset.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    {asset.type}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ color: '#6366f1' }}>{formatINR(asset.value)}</span>
                  <input
                    type="number"
                    defaultValue={asset.value}
                    onBlur={e => handleEdit(asset.id, e.target.value)}
                    style={{
                      width: '120px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      backgroundColor: '#0f172a',
                      color: '#6366f1',
                      fontSize: '0.9rem',
                      textAlign: 'right'
                    }}
                  />
                  <button
                    onClick={() => handleDelete(asset.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Asset Form */}
        {showForm ? (
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: '#94a3b8' }}>
              ADD ASSET
            </h3>
            <form onSubmit={handleAdd}>
              <input
                style={inputStyle}
                placeholder="Asset name (e.g. SBI Savings Account)"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
              <select
                style={inputStyle}
                value={type}
                onChange={e => setType(e.target.value)}
              >
                {ASSET_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                style={inputStyle}
                placeholder="Current value in ₹ (e.g. 150000)"
                type="number"
                value={value}
                onChange={e => setValue(e.target.value)}
                required
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#6366f1',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Add Asset
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#334155',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowForm(true)}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '16px',
                backgroundColor: '#1e293b',
                color: '#6366f1',
                border: '2px dashed #334155',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Add Liability
            </button>
            {/* Liabilities List */}
            {liabilities.length > 0 && (
              <div style={{
                backgroundColor: '#1e293b',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '24px'
              }}>
                <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: '#94a3b8' }}>
                  LIABILITIES
                </h3>
                {liabilities.map(liability => (
                  <div key={liability.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid #334155'
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.95rem' }}>{liability.name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                        {liability.type}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <input
                    type="number"
                    defaultValue={liability.value}
                    onBlur={e => handleEditLiability(liability.id, e.target.value)}
                    style={{
                      width: '120px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      backgroundColor: '#0f172a',
                      color: '#ef4444',
                      fontSize: '0.9rem',
                      textAlign: 'right'
                    }}
                  />
                  <button
                    onClick={() => handleDeleteLiability(liability.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}

        {/* Add Liability Form */}
        {showLiabilityForm ? (
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: '#94a3b8' }}>
              ADD LIABILITY
            </h3>
            <form onSubmit={handleAddLiability}>
              <input
                style={inputStyle}
                placeholder="Liability name (e.g. HDFC Home Loan)"
                value={liabilityName}
                onChange={e => setLiabilityName(e.target.value)}
                required
              />
              <select
                style={inputStyle}
                value={liabilityType}
                onChange={e => setLiabilityType(e.target.value)}
              >
                {LIABILITY_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                style={inputStyle}
                placeholder="Outstanding amount in ₹"
                type="number"
                value={liabilityValue}
                onChange={e => setLiabilityValue(e.target.value)}
                required
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Add Liability
                </button>
                <button
                  type="button"
                  onClick={() => setShowLiabilityForm(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#334155',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button
            onClick={() => setShowLiabilityForm(true)}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '16px',
              backgroundColor: '#1e293b',
              color: '#ef4444',
              border: '2px dashed #334155',
              cursor: 'pointer',
              fontSize: '1rem',
              marginBottom: '16px'
            }}
          >
            + Add Liability
          </button>
        )}
      </div>
    </div>
  )
}