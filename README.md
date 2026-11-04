# Team Hours

A React time tracker for a three-person team. It's hosted for free on GitHub Pages, with a free Firebase database handling logins and shared data.

## Your four links
Once it's deployed, your site lives at `https://<your-username>.github.io/<repo-name>/`. Add these endings:

| Who                  | Link            | Access                            |
|----------------------|-----------------|-----------------------------------|
| Teachers and clients | `…/#/report`    | Open, read-only, no login needed  |
| Artem                | `…/#/artem`     | Artem's password                  |
| Dima                 | `…/#/dima`      | Dima's password                   |
| Lucy                 | `…/#/lucy`      | Lucy's password                   |

The report updates live. It shows each person's total and share, a 14-day chart, and every session with its date, start and end time, and task.

## Setup (about 15 minutes)

### 1. Create the Firebase project (free)
1. Go to https://console.firebase.google.com and click **Create a project**. Google Analytics isn't needed.
2. Click **Build → Authentication → Get started**, then turn on **Email/Password**.
3. Open the **Users** tab and click **Add user** three times. Use exactly these emails, and give each person their own password:
   - `artem@teamhours.example`
   - `dima@teamhours.example`
   - `lucy@teamhours.example`

   These are login names only. No emails are ever sent to them.
4. Click **Build → Firestore Database → Create database**. Choose a location such as `europe-west`, then choose **production mode**.
5. In Firestore, open the **Rules** tab. Replace everything there with the contents of `firestore.rules` and click **Publish**.
6. Click the gear icon, then **Project settings → Your apps → Web (`</>`)**. Register an app with any nickname. Copy the `firebaseConfig` values into `src/config.js`.
7. Back in **Authentication → Settings → Authorized domains**, add `<your-username>.github.io`.

### 2. Put it on GitHub
1. Create a new repository on GitHub, for example `team-hours`.
2. Upload all the files in this folder, keeping the folder structure (`src/`, `.github/`, and the rest). Use git, or drag them in with **Add file → Upload files**.
3. In the repository, go to **Settings → Pages**. Under **Source**, choose **GitHub Actions**.
4. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to finish (about 1 minute). Your site is now live.

Every time you push to `main`, the site rebuilds automatically.

### Run it on your computer (optional)
```
npm install
npm run dev
```

## How it's protected
- Passwords are checked by Firebase. They're never stored in the code or the repository.
- The rules in `firestore.rules` let anyone read entries, which is what powers the report. Only a logged-in team member can add entries, and only under their own name. Each person can delete only their own entries.
- The keys in `src/config.js` are meant to be public. Firebase protects your data through the rules, not by keeping those keys secret.

## Changing things
- **Project name, team names, colors:** edit `src/config.js`. If you add a person, also add their id to the list in `firestore.rules` and create their login in Firebase.
- **Changing a password:** go to Firebase → Authentication → Users, delete that person, and add them again with the same email and a new password. Their logged time stays, because entries are linked to the name, not the account.
- **Exporting the data:** use the **Copy summary** button on the report. Admins can also see every entry in Firebase → Firestore.
# tracker
