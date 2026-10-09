/* ════════════════════════════════════════════════════════════════════
   Cloud sync configuration (Firebase).
   Paste the "firebaseConfig" values from Firebase console →
   Project settings → Your apps → Web app. These values identify the
   project; they are not secret. Access is protected by sign-in and the
   Firestore rules in firestore.rules.
   Leave as null to keep sync switched off (each device has its own data).
   ════════════════════════════════════════════════════════════════════ */
window.JT_FIREBASE_CONFIG = window.JT_FIREBASE_CONFIG || {
  apiKey: "AIzaSyBFjOwQ2UXYXjq0CfYbtIgMaAC7mxFYbX0",
  authDomain: "job-tracker-a5139.firebaseapp.com",
  projectId: "job-tracker-a5139",
  storageBucket: "job-tracker-a5139.firebasestorage.app",
  messagingSenderId: "474697729593",
  appId: "1:474697729593:web:2bf079aa22e21d04ccafe8"
};
