import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBviUMJocAiA8msRMhEmTCPXPP3k_-K4sI",
  authDomain: "planning-poker-b6ac1.firebaseapp.com",
  databaseURL: "https://planning-poker-b6ac1-default-rtdb.firebaseio.com",
  projectId: "planning-poker-b6ac1",
  storageBucket: "planning-poker-b6ac1.firebasestorage.app",
  messagingSenderId: "882903707416",
  appId: "1:882903707416:web:07173509fd4f14091ab86d",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
