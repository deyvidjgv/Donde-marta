// Firebase Configuration - Compat Mode (para scripts tradicionales en HTML)
// DO NOT use import/export - Firebase SDK se carga desde CDN en index.html

const firebaseConfig = {
  apiKey: 'AIzaSyC9tIl6Y5a6gawqEd_my7Gx05mkgOHRv5E',
  authDomain: 'domingos-donde-marta.firebaseapp.com',
  databaseURL: 'https://domingos-donde-marta-default-rtdb.firebaseio.com',
  projectId: 'domingos-donde-marta',
  storageBucket: 'domingos-donde-marta.firebasestorage.app',
  messagingSenderId: '186101886983',
  appId: '1:186101886983:web:626d82f036dcf5aa3abaa2',
  measurementId: 'G-XQ7RDQX7DS',
};

// Inicialización de Firebase se realiza en app.js desde el método init()
// Este archivo solo exporta la configuración
