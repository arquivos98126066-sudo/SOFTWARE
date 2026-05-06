import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPJvM-XZWfa8HQ7h8vOUsb1H",
  authDomain: "meus-apps-8ca76.firebaseapp.com",
  projectId: "meus-apps-8ca76",
  storageBucket: "meus-apps-8ca76.firebasestorage.googleapis.com",
  messagingSenderId: "768854372271",
  appId: "1:768854372271:web:467b541baf3c"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
