# Irish Poker

A Halloween party card game that everyone plays on their own phone. Four rounds of guessing (red or black, higher or lower, in between or outside, the suit), a wheel full of games after every guess, Shields that block a punishment, and a mini game after every round.

Live: https://paramonos37.github.io/irish-poker/

- **Online:** the host opens a room and gets a 4-letter code. Everyone else opens the site, types their name and the code, and plays from their own phone.
- **Practice:** "Practice against bots" runs the whole game on one phone with no setup.

## How a game runs

- **Rounds:** everyone takes a turn on card 1, then card 2, and so on. Jack, queen and king are high, aces are 1. A tie in round 2, or matching either card in round 3, means everyone drinks.
- **The wheel** (same layout every round, 8 slices):
  - 3 drink slices that climb each round (1/2/3 drinks in round 1 up to 4/5/6 in round 4). Guess right and you hand them out. Guess wrong and you take them.
  - 5 games everyone plays on their phone: **Phone vote**, **Hot potato**, **Trapdoor**, **Musical chairs** and **Odd one out**. The loser drinks 2 in round 1 up to 5 in round 4. If the spinner guessed right, they sit the game out (they still vote, and in Hot potato they throw first and can't be passed to). If they guessed wrong, they drink 1 and play.
- **Mini games**, one after every round, each played once per game in random order: **Auction**, **Imposter**, **Guess the Price** and **Cards Against Humanity**. Winning one after rounds 1 to 3 gets you a Shield. The final mini game after round 4 is for bragging rights.
- **Shields** block any punishment that lands on you. When you'd have to drink, your phone asks if you want to use one. Auction bids can't be blocked.
- **Nothing starts until everyone's ready:** every wheel game and mini game opens with an explainer on every phone, and it waits until every player taps "Got it". The host can start without waiting if someone wandered off, and can skip a game that's stuck.

The host's phone runs the game: it deals, spins, times the games and plays for any bots. If the host's phone drops off for more than 12 seconds, anyone gets a **Take over as host** button and the game carries on.

## Setup

1. Firebase project with a Realtime Database (free Spark plan). Paste the rules from `database.rules.json` into the database's Rules tab.
2. Put the web app config in `js/config.js`.
3. GitHub Pages serves the `main` branch from the root.

## Files

- `index.html`, `css/styles.css`: the page and its look.
- `js/config.js`: Firebase settings.
- `js/content.js`: the wheels, phone-vote questions, odd-one-out pairs and Imposter words.
- `js/products.js`: Guess the Price products with prices checked in October 2026. Refresh them before a future party.
- `js/cah.js`: Cards Against Humanity card text (see below).
- `js/engine.js`: the game rules, run by the host's phone.
- `js/acts.js`: the wheel game and mini game screens.
- `js/app.js`: everything else on screen.
- `js/db.js`: Firebase and the offline practice backend.

## Cards Against Humanity

The card text in `js/cah.js` is the Cards Against Humanity base set, used under the [Creative Commons BY-NC-SA 2.0 license](https://creativecommons.org/licenses/by-nc-sa/2.0/) that Cards Against Humanity LLC releases it under, compiled from [JSON Against Humanity](https://github.com/crhallberg/json-against-humanity) (CC BY-NC-SA 4.0). This project isn't affiliated with or endorsed by Cards Against Humanity. Because of that license, this game must stay free and non-commercial, and the card file stays under the same license. A handful of cards about kids were left out on purpose.

Free-plan limits: Firebase's Spark plan allows 100 phones connected at once. It stops rather than charging if a limit is ever hit.
