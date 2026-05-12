import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg",
  authDomain: "meus-apps-8ca76.firebaseapp.com",
  projectId: "meus-apps-8ca76",
  storageBucket: "meus-apps-8ca76.firebasestorage.app",
  messagingSenderId: "768854372271",
  appId: "1:768854372271:web:467b541baf3c513f03095a"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

onAuthStateChanged(auth, (user) => {
  if (!user || user.uid !== "UhH3Luc0AYW9URS6OahnSqWTTgw2") {
    window.location.href = 'index.html';
  }
});
