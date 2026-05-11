// ============================================
// auth-check.js — Proteção de autenticação
// Adicione em cada HTML protegido:
// <script type="module" src="auth-check.js"></script>
// ============================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg",
  authDomain: "meus-apps-8ca76.firebaseapp.com",
  projectId: "meus-apps-8ca76",
  storageBucket: "meus-apps-8ca76.firebasestorage.app",
  messagingSenderId: "768854372271",
  appId: "1:768854772271:web:467b541baf3c513f03095a"
};

// Inicia o Firebase só se ainda não foi iniciado
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

// Verifica se o usuário está logado
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Não está logado — redireciona para o index
    window.location.href = 'index.html';
  }
  // Se estiver logado, não faz nada — o HTML carrega normalmente
});
