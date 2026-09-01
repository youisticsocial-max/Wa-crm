import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data: deals, error } = await supabase
    .from('deals')
    .select(`
      id,
      title,
      status,
      stage_id,
      pipeline_stages!inner(name),
      pipelines(name)
    `)
    .ilike('title', '%Hamran%')

  if (error) {
    console.error('Error fetching deals:', error)
    return
  }

  console.log('Found deals:', JSON.stringify(deals, null, 2))
}

main()
