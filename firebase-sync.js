import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
export const db = getFirestore(app);
export const auth = getAuth(app);

export const authReady = new Promise(resolve => {
  onAuthStateChanged(auth, user => {
    if (user && !user.isAnonymous) { try { if (user.refreshToken) localStorage.setItem('nv.rt', user.refreshToken); } catch (e) {} resolve(user); }
    /* sem login do Google no aparelho, mas já entrou pelo menu: segue com os dados (não volta para o menu) */
    else { var ok = false; try { ok = localStorage.getItem('menu_logado') === '1' || !!localStorage.getItem('nv.rt'); } catch (e) {} if (ok) resolve(null); else location.replace('index.html'); }
  });
});
