import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg",
  authDomain: "meus-apps-8ca76.firebaseapp.com",
  projectId: "meus-apps-8ca76",
  storageBucket: "meus-apps-8ca76.firebasestorage.app",
  messagingSenderId: "768854372271",
  appId: "1:768854372271:web:467b541baf3c513f03095a"
};

export const app = initializeApp(firebaseConfig); /* só os dados dos apps antigos (etapa 2 leva para a Cloudflare) */
/* dados por um canal próprio ("nv"), que não espera o login do celular: o mesmo canal dos mapas do Rico.
   O canal antigo esperava o login, travava em alguns celulares e nada chegava à nuvem. */
const nvApp = getApps().filter(a => a.name === 'nv')[0] || initializeApp({ apiKey: firebaseConfig.apiKey, projectId: firebaseConfig.projectId, appId: firebaseConfig.appId }, 'nv');
let _db = self.__nvDb;
if (!_db) { try { _db = initializeFirestore(nvApp, { experimentalAutoDetectLongPolling: true }); } catch (e) { _db = getFirestore(nvApp); } if (self.NV_EMU) { try { connectFirestoreEmulator(_db, '127.0.0.1', self.NV_EMU); } catch (e) {} } self.__nvDb = _db; }
export const db = _db;
/* login (Cloudflare): sem a chave de renovação neste aparelho, volta para o menu */
export const authReady = new Promise(resolve => {
  var ok = false; try { ok = !!localStorage.getItem('nv.rt2'); } catch (e) {}
  if (ok) resolve(null); else location.replace('index.html');
});
