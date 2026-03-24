import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const db = createClient(url, key);

async function main() {
  const { data, error } = await db
    .from('olera-providers')
    .select('provider_id, provider_name, email, slug')
    .ilike('provider_name', '%Lima Home Care%')
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Found providers:');
  console.log(JSON.stringify(data, null, 2));
}

main();
