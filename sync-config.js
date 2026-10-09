/* ════════════════════════════════════════════════════════════════════
   Cloud sync configuration (Firebase).
   Paste the "firebaseConfig" values from Firebase console →
   Project settings → Your apps → Web app. These values identify the
   project; they are not secret. Access is protected by sign-in and the
   Firestore rules in firestore.rules.
   Leave as null to keep sync switched off (each device has its own data).
   ════════════════════════════════════════════════════════════════════ */
window.JT_FIREBASE_CONFIG = window.JT_FIREBASE_CONFIG || null;
