import { randomBytes, createHash, scrypt, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { verify, generateSecret, generateURI } from 'otplib';
export { generateSecret, generateURI };
const derive = promisify(scrypt);
const options = {N:131072,r:8,p:1,maxmem:256*1024*1024};
export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 1024) throw new Error('Use a password or passphrase of 16–1024 characters.');
  const salt = randomBytes(32).toString('hex');
  return `scrypt$${salt}$${(await derive(password,salt,64,options)).toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  if (typeof password !== 'string' || password.length > 1024 || typeof stored !== 'string') return false;
  const [algorithm,salt,value] = stored.split('$');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{128}$/.test(value)) return false;
  const actual = await derive(password,salt,64,options);
  return timingSafeEqual(actual,Buffer.from(value,'hex'));
}
function encryptionKey() {
  const key = Buffer.from(process.env.DATA_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('Encryption key is not configured.');
  return key;
}
export function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(Buffer.from('jhye-job-tracker:v1'));
  const body = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64')).join('.');
}
export function unseal(value) {
  const [iv,tag,body] = value.split('.').map(s=>Buffer.from(s,'base64'));
  const decipher = createDecipheriv('aes-256-gcm',encryptionKey(),iv);
  decipher.setAAD(Buffer.from('jhye-job-tracker:v1')); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));
}
export async function otpStep(secret, otp) {
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) return null;
  const result = await verify({secret,token:otp,epochTolerance:30});
  return result.valid ? result.timeStep : null;
}
