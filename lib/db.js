import pg from 'pg';
let pool;
export function db() {
 if(!pool) {const url=new URL(process.env.DATABASE_URL); url.searchParams.set('sslmode','verify-full'); pool=new pg.Pool({connectionString:url.toString(),max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});}
 return pool;
}
export async function transaction(run) {const c=await db().connect(); try {await c.query('BEGIN'); const result=await run(c); await c.query('COMMIT'); return result;} catch(e){await c.query('ROLLBACK'); throw e;} finally{c.release();}}
