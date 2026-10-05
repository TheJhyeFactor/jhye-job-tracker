// Run only on the owner's Mac when administrator recovery is explicitly requested.
import fs from 'node:fs';
import pg from 'pg';
import {digest,token,seal,generateSecret} from '../lib/security.js';
process.loadEnvFile('.env.production.local');
const keys=JSON.parse(fs.readFileSync('private/keys.json','utf8')); process.env.DATA_ENCRYPTION_KEY=keys.encryption;
const url=new URL(process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL);url.searchParams.set('sslmode','verify-full');
const admin=new pg.Client({connectionString:url.toString()});await admin.connect();
try {
 const activation=token(); await admin.query('BEGIN');
 await admin.query('DELETE FROM tracker_sessions');
 await admin.query("UPDATE tracker_owner SET active=false,username=NULL,password_hash=NULL,totp_encrypted=$1,last_step=-1,recovery_hashes='[]',bootstrap_hash=$2,bootstrap_expires=now()+interval '48 hours' WHERE id=1",[seal(generateSecret()),digest(activation)]);
 await admin.query('COMMIT');keys.activation=activation;fs.writeFileSync('private/keys.json',JSON.stringify(keys),{mode:0o600});
 fs.writeFileSync('private/Activate Job Tracker.command',`#!/bin/zsh\nopen 'https://thejhyefactor.github.io/jhye-job-tracker/#activate=${activation}'\n`,{mode:0o700});
 console.log('Sessions revoked. Fresh private activation launcher created; application records preserved.');
}finally{await admin.end();}
