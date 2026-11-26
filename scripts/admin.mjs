import pg from 'pg';
try{process.loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
const connectionString=process.env.SUPABASE_DB_URL,email=process.env.ADMIN_EMAIL?.trim().toLowerCase();
if(!connectionString||!email)throw Error('Set backend-only SUPABASE_DB_URL and ADMIN_EMAIL');
const client=new pg.Client({connectionString});await client.connect();
try{const {rows}=await client.query('select id from auth.users where lower(email)=$1 and email_confirmed_at is not null and coalesce(is_anonymous,false)=false',[email]);if(rows.length!==1)throw Error('Exactly one verified, non-anonymous account must match ADMIN_EMAIL. Sign in by OTP first.');await client.query('insert into goku_private.admins(user_id) values($1) on conflict do nothing',[rows[0].id]);console.log('Verified account authorized as Admin.');}finally{await client.end();}
