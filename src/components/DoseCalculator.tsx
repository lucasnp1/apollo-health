/**
 * DoseCalculator — syringe volume calculator.
 *
 * Given a vial concentration (mg/mL) and desired dose (mg),
 * calculates the volume in mL and units on a 1mL insulin syringe (100 units).
 */
import { useState } from 'react'
import { Calculator, X } from 'lucide-react'

export function DoseCalculator({ onClose }: { onClose: () => void }) {
  const [concentration, setConcentration] = useState('') // mg/mL
  const [dose, setDose]                   = useState('') // mg
  const [syringeUnits, setSyringeUnits]   = useState('100') // markings on syringe

  const conc   = parseFloat(concentration)
  const doseN  = parseFloat(dose)
  const syrN   = parseFloat(syringeUnits) || 100

  const valid = conc > 0 && doseN > 0
  const ml    = valid ? doseN / conc : null
  const units = ml !== null ? ml * syrN : null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '0 0 env(safe-area-inset-bottom, 20px)' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--line)' }} />
        </div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tools</p>
            <h3 style={{ margin: 0, fontSize: 17, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Calculator size={17} /> Dose calculator
            </h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>
                Vial concentration
                <span style={{ fontWeight: 400, color: 'var(--ink-mute)', marginLeft: 4 }}>mg/mL</span>
              </label>
              <input
                inputMode="decimal"
                value={concentration}
                onChange={e => setConcentration(e.target.value)}
                placeholder="e.g. 300"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>
                Dose needed
                <span style={{ fontWeight: 400, color: 'var(--ink-mute)', marginLeft: 4 }}>mg</span>
              </label>
              <input
                inputMode="decimal"
                value={dose}
                onChange={e => setDose(e.target.value)}
                placeholder="e.g. 200"
              />
            </div>
          </div>

          {/* Syringe type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-dim)' }}>Syringe markings</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ label: '1mL / 100u', value: '100' }, { label: '1mL / 40u', value: '40' }, { label: 'No syringe', value: '0' }].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSyringeUnits(opt.value)}
                  style={{
                    flex: 1,
                    padding: '9px 4px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    background: syringeUnits === opt.value ? 'var(--accent-soft)' : 'var(--surface-2)',
                    color: syringeUnits === opt.value ? 'var(--accent)' : 'var(--ink-dim)',
                    border: syringeUnits === opt.value ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Result */}
          {valid && ml !== null ? (
            <div style={{ background: 'var(--accent-soft)', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>Volume to draw</span>
                <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '-0.03em' }}>
                  {ml.toFixed(3)} mL
                </span>
              </div>
              {syringeUnits !== '0' && units !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid rgba(8,145,178,0.2)', paddingTop: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>On {syringeUnits}u syringe</span>
                  <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '-0.02em' }}>
                    {units.toFixed(1)} units
                  </span>
                </div>
              )}
              <p style={{ margin: 0, fontSize: 11, color: 'var(--accent)', opacity: 0.7 }}>
                {doseN}mg ÷ {conc}mg/mL = {ml.toFixed(3)}mL
              </p>
            </div>
          ) : (
            <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '16px 20px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>
              Enter concentration and dose to calculate
            </div>
          )}

          <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
            Always double-check calculations before injecting. When in doubt, consult your prescribing physician.
          </p>
        </div>
      </div>
    </div>
  )
}
