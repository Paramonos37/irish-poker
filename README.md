# Irish Poker

A Halloween party card game that everyone plays on their own phone. Four rounds of guessing (red or black, higher or lower, in between or outside, the suit), a punishment wheel for every guess, Shields that skip a punishment, and a random mini game after each round.

- **Online:** the host opens a room and gets a 4-letter code. Everyone else opens the site, types their name and the code, and plays from their own phone. Every phone sees the cards flip and the wheel spin at the same time.
- **Practice:** "Practice against bots" runs the whole game on one phone with no setup.

## How the game runs

The host's phone runs the game. It deals, spins the wheel, times the mini games and plays for any bots. Everyone else's phone sends their taps (guesses, picks, Shields, mini-game scores) and draws what the room shows. If the host's phone drops off for more than 12 seconds, anyone gets a **Take over as host** button and the game carries on from where it was.

- Rounds: everyone takes a turn on card 1, then card 2, and so on. Jack, queen and king are high, aces are 1. A tie in round 2, or matching either card in round 3, means everyone drinks.
- Wheels: one per round, eight slices each, getting wilder each round. Guess right and you hand it out. Guess wrong and it's yours, unless you play a Shield.
- Mini games after rounds 1 to 3 win a Shield (hold up to 2; a third becomes a bonus point). The mini game after round 4 is worth a bonus point.
- Mini games: Cup Shot, Quick Draw, Stop the Clock, Ghost Whack, Shake the Cauldron, Simon Spooks and Speed Bus. Each game uses a different one, with no repeats.
- The host can edit all four wheels from the lobby. Edited wheels are remembered on the host's phone for the next game.

## Setup (about 10 minutes, once)

### 1. Firebase (keeps the phones in sync, free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project**. Name it `irish-poker`. You can turn off Google Analytics.
2. In the left menu open **Build → Realtime Database → Create database**. Pick a US location and **Start in locked mode**.
3. Open the **Rules** tab of the database, replace everything with the contents of `database.rules.json` from this repo, and click **Publish**.
4. Click the gear icon → **Project settings** → **Your apps** → the web icon (`</>`). Register the app (no hosting needed) and copy the `firebaseConfig` object it shows.
5. Paste that object into `js/config.js` in place of `null`, so it reads `window.FIREBASE_CONFIG = { apiKey: "...", ... };`. Make sure it includes `databaseURL`.

The Firebase web config is not a secret: it only identifies the project. The database rules decide what can be read and written.

### 2. GitHub Pages (the link you send people)

1. Push this repo to GitHub as a **public** repository.
2. In the repo go to **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, and save.
3. After a minute the site is live at `https://<your-username>.github.io/irish-poker/`.

### 3. Test before the party

Open the site on two phones. Host on one, join with the code on the other, add a couple of bots, and play a round plus one mini game.

## Tips for the night

- The host should keep the game open with the screen on. The site asks the phone to stay awake, but a low-power mode can still lock it.
- Room links work too: `https://<your-username>.github.io/irish-poker/?room=ABCD` fills in the code.
- If someone's phone dies mid-game, they open the link again with the same phone and land back in their seat.
- Shake the Cauldron asks for motion access on iPhones. If someone says no, they play it by tapping instead.

## Files

- `index.html`, `css/styles.css`: the page and its look.
- `js/config.js`: your Firebase settings.
- `js/wheels.js`: the default punishment wheels.
- `js/engine.js`: the game rules, run by the host's phone.
- `js/minimeta.js`, `js/minis.js`: mini-game rules and screens.
- `js/db.js`: Firebase and the offline practice backend.
- `js/app.js`: all the screens.
- `database.rules.json`: Firebase rules to paste in during setup.

Free-plan limits: Firebase's Spark plan allows 100 phones connected at once, far more than a party needs. It stops rather than charging if a limit is ever hit.
