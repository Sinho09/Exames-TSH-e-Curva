// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDWVLB5bi3xP3L--whOkCVDJ3cjkML1tBA",
  authDomain: "bancodedadosioan.firebaseapp.com",
  databaseURL: "https://bancodedadosioan-default-rtdb.firebaseio.com",
  projectId: "bancodedadosioan",
  storageBucket: "bancodedadosioan.firebasestorage.app",
  messagingSenderId: "631722624287",
  appId: "1:631722624287:web:d7d87829b17cdd98a3dc2a",
  measurementId: "G-33124GT6JP"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Inicializar Firestore
const db = firebase.firestore();

console.log("Firebase inicializado com sucesso!");

