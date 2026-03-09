'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

const INTERESTS = ['Music', 'Hiking', 'Cooking', 'Travel', 'Art', 'Sports', 'Reading', 'Dancing', 'Photography', 'Tech', 'Fashion', 'Film', 'Fitness', 'Gaming', 'Coffee', 'Nature', 'Entrepreneurship', 'Food', 'Comedy', 'Yoga']

interface FormData {
  displayName: string; bio: string; age: string; birthDate: string
  gender: string; interestedIn: string[]; interests: string[]; lookingFor: string
  occupation: string; education: string
}

const STEPS = ['Basics', 'About You', 'Preferences', 'Interests']

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<FormData>({
    displayName: '', bio: '', age: '', birthDate: '', gender: '',
    interestedIn: [], interests: [], lookingFor: '', occupation: '', education: '',
  })

  const update = (k: keyof FormData, v: any) => setData(d => ({ ...d, [k]: v }))
  const toggleArr = (k: 'interestedIn' | 'interests', v: string) =>
    setData(d => ({ ...d, [k]: d[k].includes(v) ? d[k].filter(x => x !== v) : [...d[k], v] }))

  const next = () => {
    if (step === 0 && (!data.displayName || !data.age || !data.gender)) return toast.error('Fill in all required fields')
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else submit()
  }

  const submit = async () => {
    setLoading(true)
    try {
      await api.post('/profiles', {
        ...data,
        age: parseInt(data.age),
        birthDate: data.birthDate || new Date(new Date().getFullYear() - parseInt(data.age), 0, 1).toISOString(),
      })
      toast.success('Profile created! 🎉')
      router.push('/discover')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to create profile')
    } finally { setLoading(false) }
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-display font-bold text-white mb-1">Set up your profile</h1>
        <p className="text-gray-500 font-mono text-xs">{step + 1} of {STEPS.length} — {STEPS[step]}</p>
      </div>

      {/* Progress */}
      <div className="flex gap-1 mb-8">
        {STEPS.map((_, i) => (
          <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-surface-raised">
            <div className="h-full bg-gold-500 transition-all duration-500 rounded-full"
              style={{ width: i <= step ? '100%' : '0%' }} />
          </div>
        ))}
      </div>

      <div className="card p-6">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }} className="space-y-4">

            {step === 0 && (
              <>
                <div>
                  <label className="section-label block mb-2">Display Name *</label>
                  <input className="input" placeholder="Your name" value={data.displayName} onChange={e => update('displayName', e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="section-label block mb-2">Age *</label>
                  <input className="input" type="number" placeholder="25" min="18" max="99" value={data.age} onChange={e => update('age', e.target.value)} />
                </div>
                <div>
                  <label className="section-label block mb-2">I am *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['MALE', 'FEMALE', 'NON_BINARY', 'OTHER'].map(g => (
                      <button key={g} onClick={() => update('gender', g)}
                        className={`py-3 rounded-xl border font-mono text-xs transition-colors ${data.gender === g ? 'bg-gold-500/10 border-gold-500/40 text-gold-500' : 'border-border-subtle text-gray-500 hover:border-gray-500'}`}>
                        {g === 'NON_BINARY' ? 'Non-binary' : g.charAt(0) + g.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <label className="section-label block mb-2">Bio</label>
                  <textarea className="input resize-none" rows={4} placeholder="Tell people a bit about yourself..." value={data.bio} onChange={e => update('bio', e.target.value)} maxLength={500} />
                  <p className="text-gray-600 font-mono text-xs mt-1 text-right">{data.bio.length}/500</p>
                </div>
                <div>
                  <label className="section-label block mb-2">Occupation</label>
                  <input className="input" placeholder="What do you do?" value={data.occupation} onChange={e => update('occupation', e.target.value)} />
                </div>
                <div>
                  <label className="section-label block mb-2">Education</label>
                  <select className="input" value={data.education} onChange={e => update('education', e.target.value)}>
                    <option value="">Select...</option>
                    {['High School', 'Diploma', "Bachelor's Degree", "Master's Degree", 'PhD', 'Vocational Training', 'Self-taught'].map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="section-label block mb-2">Interested in</label>
                  <div className="flex flex-wrap gap-2">
                    {['MALE', 'FEMALE', 'NON_BINARY', 'OTHER'].map(g => (
                      <button key={g} onClick={() => toggleArr('interestedIn', g)}
                        className={`tag transition-colors cursor-pointer ${data.interestedIn.includes(g) ? 'tag-pink' : 'tag-muted hover:border-gray-500'}`}>
                        {g === 'NON_BINARY' ? 'Non-binary' : g.charAt(0) + g.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="section-label block mb-2">Looking for</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Relationship', 'Friendship', 'Casual dating', 'Not sure yet'].map(l => (
                      <button key={l} onClick={() => update('lookingFor', l)}
                        className={`py-3 rounded-xl border font-sans text-sm transition-colors ${data.lookingFor === l ? 'bg-gold-500/10 border-gold-500/40 text-gold-500' : 'border-border-subtle text-gray-500 hover:border-gray-500'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <div>
                <label className="section-label block mb-3">Pick your interests (up to 10)</label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map(i => (
                    <button key={i} onClick={() => toggleArr('interests', i)}
                      disabled={!data.interests.includes(i) && data.interests.length >= 10}
                      className={`tag transition-colors cursor-pointer ${data.interests.includes(i) ? 'tag-pink' : 'tag-muted hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed'}`}>
                      {i}
                    </button>
                  ))}
                </div>
                <p className="text-gray-600 font-mono text-xs mt-3">{data.interests.length}/10 selected</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex gap-3 mt-4">
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} className="btn-secondary flex-1">Back</button>
        )}
        <button onClick={next} disabled={loading} className="btn-primary flex-1">
          {loading ? 'Creating...' : step === STEPS.length - 1 ? 'Create Profile 🎉' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
