// Game content: the wheels, phone-vote questions, odd-one-out pairs and Imposter words.
(function (IP) {
  'use strict';

  IP.ROUND_NAMES = ['', 'Red or black', 'Higher or lower', 'In between or outside', 'Guess the suit'];
  IP.WHEEL_NAMES = ['', 'Warm-up', 'Heating up', 'Spooky', 'Chaos'];
  // Drink slices on each round's wheel, and what the loser of a wheel game drinks.
  IP.DRINKS = [null, [1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]];
  IP.ACT_DRINKS = [0, 2, 3, 4, 5];

  IP.ACT_INFO = {
    vote: { name: 'Phone vote', label: 'VOTE' },
    potato: { name: 'Hot potato', label: 'POTATO' },
    trap: { name: 'Trapdoor', label: 'TRAPDOOR' },
    chairs: { name: 'Musical chairs', label: 'CHAIRS' },
    odd: { name: 'Odd one out', label: 'ODD ONE' },
    auction: { name: 'Auction', tag: 'Bluff' },
    imposter: { name: 'Imposter', tag: 'Deception' },
    price: { name: 'Guess the Price', tag: 'Shopping' },
    cah: { name: 'Cards Against Humanity', tag: 'Cards' }
  };
  IP.MINI_KINDS = ['auction', 'imposter', 'price', 'cah'];

  // Same layout every round: three drink slices and five wheel games.
  IP.wheelFor = function (round) {
    const d = IP.DRINKS[round] || IP.DRINKS[1];
    return {
      name: IP.WHEEL_NAMES[round] || '',
      slices: [
        { type: 'drinks', n: d[0] },
        { type: 'vote' },
        { type: 'potato' },
        { type: 'drinks', n: d[1] },
        { type: 'trap' },
        { type: 'chairs' },
        { type: 'drinks', n: d[2] },
        { type: 'odd' }
      ]
    };
  };
  IP.sliceLabel = s => s.type === 'drinks' ? `${s.n} DRINK${s.n === 1 ? '' : 'S'}` : IP.ACT_INFO[s.type].label;

  IP.VOTE_PROMPTS = [
    'Most likely to get scared first in a haunted house',
    'Most likely to survive a horror movie',
    'Most likely to die first in a horror movie',
    'Most likely to eat all the candy before a single trick-or-treater shows up',
    'Most likely to text their ex tonight',
    'Most likely to fall asleep at this party first',
    'Most likely to still be up at 4 a.m.',
    'Most likely to lose their phone tonight',
    'Most likely to cry during a movie',
    'Most likely to go viral',
    'Most likely to believe in ghosts',
    'Most likely to scream at a jump scare',
    'Most likely to cheat at this game',
    'Most likely to order fast food at 2 a.m.',
    'Most likely to forget everyone’s name',
    'Most likely to start a dance-off',
    'Most likely to get lost in a corn maze',
    'Most likely to show up in the same costume as someone else',
    'Most likely to become famous',
    'Most likely to move across the country on a whim',
    'Most likely to start a cult',
    'Most likely to win a reality show',
    'Most likely to get kicked out of a bar',
    'Most likely to adopt a black cat',
    'Most likely to hide during a zombie apocalypse',
    'Most likely to lead the group during a zombie apocalypse',
    'Most likely to be a vampire in disguise',
    'Most likely to try talking to a ghost on purpose',
    'Most likely to set off the smoke alarm cooking',
    'Most likely to show up late to their own wedding',
    'Most likely to get a tattoo they regret',
    'Most likely to sing karaoke without being asked',
    'Most likely to laugh at the worst possible moment',
    'Most likely to lose a fight to a raccoon',
    'Most likely to spend their whole paycheck on Halloween decorations',
    'Most likely to keep their decorations up until Christmas',
    'Most likely to stay mad about a board game for a week',
    'Most likely to befriend the bouncer',
    'Most likely to call their mom tonight',
    'Most likely to say yes to a dare without hearing it',
    'Most likely to spill a drink in the next hour',
    'Most likely to think they’re the main character',
    'Most likely to trip over nothing',
    'Most likely to get a psychic reading',
    'Most likely to accidentally like an old photo',
    'Most likely to steal the last slice of pizza'
  ];

  IP.ODD_PAIRS = [
    { q: 'Pick one', a: 'Pumpkin', b: 'Ghost' },
    { q: 'Pick one', a: 'Vampire', b: 'Werewolf' },
    { q: 'Pick one', a: 'Trick', b: 'Treat' },
    { q: 'Pick one', a: 'Candy corn', b: 'Caramel apple' },
    { q: 'Pick one', a: 'Haunted house', b: 'Corn maze' },
    { q: 'Pick one', a: 'Witch', b: 'Wizard' },
    { q: 'Pick one', a: 'Zombie', b: 'Mummy' },
    { q: 'Pick one', a: 'Scary movie', b: 'Comedy' },
    { q: 'Pick one', a: 'Cats', b: 'Dogs' },
    { q: 'Pick one', a: 'Beach', b: 'Mountains' },
    { q: 'Pick one', a: 'Morning person', b: 'Night owl' },
    { q: 'Pick one', a: 'Pizza', b: 'Tacos' },
    { q: 'Pick one', a: 'Coffee', b: 'Energy drink' },
    { q: 'Pick one', a: 'Text', b: 'Call' },
    { q: 'Pick one', a: 'Sweet', b: 'Salty' },
    { q: 'Pick one', a: 'Summer', b: 'Winter' },
    { q: 'Superpower', a: 'Fly', b: 'Be invisible' },
    { q: 'Pick one', a: 'Ketchup', b: 'Mustard' },
    { q: 'Pick one', a: 'iPhone', b: 'Android' },
    { q: 'Pick one', a: 'Pancakes', b: 'Waffles' },
    { q: 'Which is real?', a: 'Bigfoot', b: 'Aliens' },
    { q: 'Time travel to the', a: 'Past', b: 'Future' },
    { q: 'Shower in the', a: 'Morning', b: 'Night' },
    { q: 'Pick one', a: 'Pool', b: 'Ocean' },
    { q: 'Pick one', a: 'Chocolate', b: 'Gummy candy' },
    { q: 'Pick one', a: 'City', b: 'Country' },
    { q: 'Pick one', a: 'Window seat', b: 'Aisle seat' },
    { q: 'Pick one', a: 'Fries', b: 'Onion rings' },
    { q: 'Superpower', a: 'Read minds', b: 'See the future' },
    { q: 'Friday night', a: 'Go out', b: 'Stay in' },
    { q: 'Is a hot dog a sandwich?', a: 'Yes', b: 'No' },
    { q: 'Pineapple on pizza?', a: 'Yes', b: 'No' },
    { q: 'Would you sleep in a haunted house for $1,000?', a: 'Yes', b: 'No' },
    { q: 'Pick one', a: 'Skeleton', b: 'Black cat' },
    { q: 'Pick one', a: 'Dracula', b: 'Frankenstein' },
    { q: 'Pick one', a: 'Clowns', b: 'Spiders' }
  ];

  // Imposter: everyone gets the same word except the imposter.
  IP.IMPOSTER = [
    { cat: 'Monsters', words: ['Vampire', 'Werewolf', 'Zombie', 'Mummy', 'Ghost', 'Witch', 'Skeleton', 'Bigfoot', 'Goblin', 'Frankenstein'] },
    { cat: 'Halloween candy', words: ['Candy corn', 'Snickers', 'Reese’s cups', 'Skittles', 'Kit Kat', 'Twix', 'Sour Patch Kids', 'M&M’s', 'Tootsie Rolls', 'Starburst', 'Butterfinger', 'Milk Duds'] },
    { cat: 'Halloween things', words: ['Jack-o’-lantern', 'Haunted house', 'Corn maze', 'Hayride', 'Costume contest', 'Trick-or-treating', 'Bobbing for apples', 'Graveyard', 'Black cat', 'Cobwebs', 'Broomstick', 'Cauldron'] },
    { cat: 'Horror movies', words: ['Halloween', 'Scream', 'The Exorcist', 'It', 'Saw', 'The Shining', 'Friday the 13th', 'A Nightmare on Elm Street', 'Get Out', 'The Conjuring', 'Hocus Pocus', 'Beetlejuice'] },
    { cat: 'Costumes', words: ['Pirate', 'Cowboy', 'Superhero', 'Ninja', 'Astronaut', 'Princess', 'Clown', 'Firefighter', 'Mermaid', 'Dinosaur', 'Banana', 'Police officer'] },
    { cat: 'Party stuff', words: ['Beer pong', 'Karaoke', 'Red cup', 'Hangover', 'Playlist', 'Bag of ice', 'Uber', 'Selfie', 'Dance floor', 'Group chat', 'After-party', 'Pizza delivery'] },
    { cat: 'Food', words: ['Tacos', 'Pizza', 'Sushi', 'Burger', 'Wings', 'Nachos', 'Ramen', 'Pancakes', 'Mac and cheese', 'Hot dog', 'Burrito', 'French fries'] },
    { cat: 'Places', words: ['Beach', 'Casino', 'Gym', 'Airport', 'Hospital', 'Zoo', 'Library', 'Nightclub', 'Church', 'Mall', 'Campground', 'Bowling alley'] }
  ];
})(window.IP = window.IP || {});
