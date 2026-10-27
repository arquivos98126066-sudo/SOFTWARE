import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, initializeFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg",
  authDomain: "meus-apps-8ca76.firebaseapp.com",
  projectId: "meus-apps-8ca76",
  storageBucket: "meus-apps-8ca76.firebasestorage.app",
  messagingSenderId: "768854372271",
  appId: "1:768854372271:web:467b541baf3c513f03095a"
};

export const app = initializeApp(firebaseConfig);
/* dados por um canal próprio ("nv"), que não espera o login do celular: o mesmo canal dos mapas do Rico.
   O canal antigo esperava o login, travava em alguns celulares e nada chegava à nuvem. */
const nvApp = getApps().filter(a => a.name === 'nv')[0] || initializeApp({ apiKey: firebaseConfig.apiKey, projectId: firebaseConfig.projectId, appId: firebaseConfig.appId }, 'nv');
let _db; try { _db = initializeFirestore(nvApp, { experimentalAutoDetectLongPolling: true }); } catch (e) { _db = getFirestore(nvApp); }
export const db = _db;
export const auth = getAuth(app);

export const authReady = new Promise(resolve => {
  onAuthStateChanged(auth, user => {
    if (user && !user.isAnonymous) { try { if (user.refreshToken) localStorage.setItem('nv.rt', user.refreshToken); } catch (e) {} resolve(user); }
    /* sem login do Google no aparelho, mas já entrou pelo menu: segue com os dados (não volta para o menu) */
    else { var ok = false; try { ok = localStorage.getItem('menu_logado') === '1' || !!localStorage.getItem('nv.rt'); } catch (e) {} if (ok) resolve(null); else location.replace('index.html'); }
  });
});
