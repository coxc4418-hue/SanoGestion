// SanoGestion — Crea las cuentas de las sedes y el administrador general.
// Uso:  node provision.mjs [cantidad=20] [--emu]
// Genera contraseñas y PIN aleatorios y los guarda en ../CREDENCIALES_SANOGESTION.txt
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } from 'firebase/firestore';
import { webcrypto, randomInt } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const EMU = process.argv.includes('--emu');
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 20);
const OUT = path.join(here, '..', EMU ? 'CREDENCIALES_EMULADOR.txt' : 'CREDENCIALES_SANOGESTION.txt');
const STATE = path.join(here, EMU ? '.accounts-emu.json' : '.accounts.json');
const DOMAIN = 'sanogestion.app';

const config = {
  apiKey: 'AIzaSyBnIqgc0iN-Z2Fy5P__8csKaaXdrx7Zkds',
  authDomain: 'sano-gestion.firebaseapp.com',
  projectId: 'sano-gestion',
  storageBucket: 'sano-gestion.firebasestorage.app',
  messagingSenderId: '587476643336',
  appId: '1:587476643336:web:b3574beb6720b6e5a16bbd'
};

const CATEGORIES = ['Víveres', 'Bebidas', 'Lácteos', 'Charcutería', 'Limpieza', 'Higiene personal', 'Snacks y dulces', 'Panadería', 'Enlatados', 'Frutas y verduras', 'Carnes', 'Varios'];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const genPass = () => 'Sg-' + Array.from({ length: 9 }, () => ALPHA[randomInt(ALPHA.length)]).join('') + '!' + randomInt(10, 99);
const genPin = () => String(randomInt(1000, 9999));
async function sha256(t) {
  const b = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return Buffer.from(b).toString('hex');
}

// Conserva credenciales ya generadas (permite re-ejecutar sin cambiar contraseñas)
const saved = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};

const app = initializeApp(config, 'provision');
const auth = getAuth(app);
const db = initializeFirestore(app, {});
if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

async function ensureUser(email, password) {
  try {
    return (await createUserWithEmailAndPassword(auth, email, password)).user;
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') return (await signInWithEmailAndPassword(auth, email, password)).user;
    throw e;
  }
}

const accounts = [];
for (let i = 1; i <= COUNT; i++) {
  const code = 'sede' + String(i).padStart(2, '0');
  const email = `${code}@${DOMAIN}`;
  const acc = saved[code] || { code, email, password: genPass(), pin: genPin(), name: `Sede ${String(i).padStart(2, '0')}` };
  const user = await ensureUser(email, acc.password);
  acc.uid = user.uid;
  const tRef = doc(db, 'tenants', user.uid);
  if (!(await getDoc(tRef)).exists()) {
    const now = new Date().toISOString();
    await setDoc(tRef, { name: acc.name, code, ownerUid: user.uid, ownerEmail: email, active: true, createdAt: now });
    await setDoc(doc(db, 'tenants', user.uid, 'config', 'settings'), {
      businessName: acc.name, rif: '', phone: '', address: '', slogan: '', receiptFormat: '80mm', receiptFooter: '¡Gracias por su compra!',
      rate: 0, rateParallel: 0, iva: 16, creditDays: 15, lowStock: 3, categories: CATEGORIES, advanceCommission: 10, rechargeCommission: 10
    });
    await setDoc(doc(db, 'tenants', user.uid, 'config', 'security'), { pinHash: await sha256(`${user.uid}:${acc.pin}`), updatedAt: now });
    console.log(`✔ ${code} creada (${user.uid})`);
  } else {
    console.log(`• ${code} ya existía (${user.uid})`);
  }
  await signOut(auth);
  saved[code] = acc;
  accounts.push(acc);
}

const admin = saved.admin || { code: 'admin', email: `admin@${DOMAIN}`, password: genPass() };
const au = await ensureUser(admin.email, admin.password);
admin.uid = au.uid;
saved.admin = admin;
await signOut(auth);
console.log(`✔ administrador general listo (${au.uid})`);

writeFileSync(STATE, JSON.stringify(saved, null, 2));
const lines = [
  'SANOGESTION — CREDENCIALES DE ACCESO' + (EMU ? ' (EMULADOR DE PRUEBAS)' : ''),
  `Generado: ${new Date().toLocaleString('es-VE')}`,
  'Aplicación: https://sano-gestion.web.app',
  '',
  'Inicia sesión escribiendo el USUARIO (ej. sede01) o el correo completo.',
  'El PIN protege reportes, anulaciones, eliminaciones, ajustes de stock y cierre de caja.',
  'Cada sede puede cambiar su contraseña y su PIN en Configuración > Seguridad.',
  'GUARDA ESTE ARCHIVO EN UN LUGAR SEGURO.',
  '',
  'ADMINISTRADOR GENERAL (panel de todas las sedes)',
  `  Usuario: admin    Correo: ${admin.email}    Contraseña: ${admin.password}`,
  '',
  'SEDES',
  '  Usuario   Contraseña          PIN    Correo',
  ...accounts.map((a) => `  ${a.code.padEnd(9)} ${a.password.padEnd(19)} ${a.pin}   ${a.email}`)
];
writeFileSync(OUT, lines.join('\r\n'), 'utf8');
console.log(`\nCredenciales guardadas en ${OUT}`);
await deleteApp(app);
process.exit(0);
