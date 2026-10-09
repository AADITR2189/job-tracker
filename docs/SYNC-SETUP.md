# Setting up sync (same data on phone and PC)

Sync uses **Google Firebase** (free "Spark" plan, no credit card needed). You do this once (about 10 minutes). Afterwards you sign in on each device.

## 1. Create the Firebase project
1. Open https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it `job-tracker`, then click **Continue**.
3. Google Analytics is not needed: switch it off and click **Create project**, then **Continue**.

## 2. Turn on email + password sign-in
1. In the left menu: **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, click **Email/Password**, switch on the first toggle, and click **Save**.
3. On the **Users** tab, click **Add user**. Enter your email and a strong password, then click **Add user**. This is the account you will sign in with in the app.
4. On the **Settings** tab, open **User actions** and **untick "Enable create (sign-up)"**, then **Save**. Now nobody else can create an account in your project.

## 3. Create the database
1. In the left menu: **Build → Firestore Database → Create database**.
2. Choose a location close to you (e.g. `asia-south1 (Mumbai)`), then click **Next**.
3. Choose **Start in production mode**, then click **Create**.
4. Open the **Rules** tab, delete everything there, paste the rules below, and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

These rules mean only the signed-in owner can read or write their own data. The same rules are in `firestore.rules` in this repository.

## 4. Connect the app
1. Click the **gear icon → Project settings**. Under **Your apps**, click the **Web** icon (`</>`).
2. Enter the nickname `Job Tracker`, **don't** tick Firebase Hosting, and click **Register app**.
3. You'll see a block of code containing `const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", ... }`. Copy just the part inside the `{ }`.
4. Put it into `sync-config.js` in this repository:

```js
window.JT_FIREBASE_CONFIG = window.JT_FIREBASE_CONFIG || {
  apiKey: "...",
  authDomain: "....firebaseapp.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

(Or send the values to Claude to add it for you.) These values only identify your project; they are not passwords. Your data is protected by your sign-in and the rules above.

## 5. Start syncing
1. **On the device with your real data (your PC):** open the app, click the **cloud button** at the top, sign in, then choose **Upload this device's data**.
2. **On your phone:** open the app, tap the **cloud button**, sign in, and choose **Use online data**.
3. Done. Changes on either device appear on the other within a few seconds. The cloud button shows the status: green = synced, blue = saving, amber = offline (changes are kept and sent later), red = problem.

## Good to know
- **Offline still works.** Changes made without internet are saved on the device and sent when you're back online. If both devices changed different jobs meanwhile, both sets of changes are kept. If both changed the *same* job, the device that syncs last wins for that job.
- **Backups:** keep using **Export JSON** now and then. The file format is unchanged.
- **Forgot password:** use "Forgot password?" in the sign-in window, or change it in Firebase → Authentication → Users.
- **Free plan limits** (50,000 reads and 20,000 writes per day, 1 GB storage) are far above what this app uses.
- **To stop syncing** on a device: Settings → Sync → **Sign out**. The data stays on that device.
