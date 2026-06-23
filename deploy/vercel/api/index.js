import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function handler(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`)

  try {
    if (pathname === '/api/banks') {
      const { data } = await supabase.from('banks').select('bank_name, source_url')
      return res.status(200).json((data || []).map(b => ({
        bank_name: b.bank_name,
        url: b.source_url
      })))
    }

    if (pathname === '/api/latest' || pathname === '/api/all-rates') {
      const { data: banks } = await supabase.from('banks').select('bank_id, bank_name, source_url')
      if (!banks) return res.status(200).json([])

      const result = await Promise.all(banks.map(async (bank) => {
        const { data: rates } = await supabase
          .from('rates')
          .select('tenure, general_rate, senior_citizen_rate')
          .eq('bank_id', bank.bank_id)

        return {
          bank_name: bank.bank_name,
          url: bank.source_url,
          rates: (rates || []).map(r => ({
            tenure: r.tenure,
            interest_rate: r.general_rate,
            senior_citizen_interest_rate: r.senior_citizen_rate
          }))
        }
      }))

      return res.status(200).json(result)
    }

    const bankMatch = pathname.match(/^\/api\/rates\/(.+)$/)
    if (bankMatch) {
      const bankName = decodeURIComponent(bankMatch[1])
      const { data: banks } = await supabase
        .from('banks')
        .select('bank_id, bank_name, source_url')
        .ilike('bank_name', bankName)

      if (!banks || banks.length === 0) {
        return res.status(404).json({ error: 'Bank not found' })
      }

      const bank = banks[0]
      const { data: rates } = await supabase
        .from('rates')
        .select('tenure, general_rate, senior_citizen_rate')
        .eq('bank_id', bank.bank_id)

      return res.status(200).json({
        bank_name: bank.bank_name,
        url: bank.source_url,
        rates: (rates || []).map(r => ({
          tenure: r.tenure,
          interest_rate: r.general_rate,
          senior_citizen_interest_rate: r.senior_citizen_rate
        }))
      })
    }

    return res.status(404).json({ error: 'Not found' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
