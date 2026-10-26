// Guess the Price products. Prices were checked online in late October 2026; each line notes where.
// Store prices change, so refresh this list before a future party.
(function (IP) {
  'use strict';
  const P = (name, detail, store, price, cat, src) => ({ name, detail, store, price, cat, src });
  IP.PRODUCTS = [
    P('USPS Forever Stamp', '1 stamp', 'U.S. Postal Service', 0.82, 'misc', 'hip2save.com, July 2026 price change'),
    P('Maruchan Ramen, Chicken', '3 oz pack', 'Walmart', 0.50, 'food', 'walmart.com'),
    P('AriZona Iced Tea', '22 oz can, price printed on the can', 'AriZona', 0.99, 'drink', 'drinkarizona.com'),
    P('Hot Dog & Soda Combo', 'Hot dog plus 20 oz soda', 'Costco food court', 1.50, 'food', 'costcoguides.com'),
    P('Pizza Slice', '1 slice, cheese or pepperoni', 'Costco food court', 1.99, 'food', 'costcoguides.com'),
    P('Brach’s Candy Corn', '11 oz bag', 'Walmart', 2.68, 'candy', 'walmart.com'),
    P('Rotisserie Chicken', '1 whole chicken', 'Costco', 4.99, 'food', 'tastingtable.com'),
    P('Ceramic Ghost Sculpture', 'Hyde & EEK! Boutique, 2026', 'Target', 5.00, 'halloween', 'hauntedattractionnetwork.com'),
    P('Pumpkin Masters Carving Kit', 'All-in-one kit, 12 pieces', 'Walmart', 5.78, 'halloween', 'walmart.com'),
    P('UNO Card Game', 'Classic deck', 'Target', 6.99, 'toy', 'target.com'),
    P('Apple Polishing Cloth', 'The famous cleaning cloth', 'Apple Store', 9.00, 'misc', 'notebookcheck.net, Aug 2026 price cut'),
    P('Whole Pizza', '18-inch pizza', 'Costco food court', 9.95, 'food', 'costcoguides.com'),
    P('Frooties Halloween Bag', '400 pieces', 'Target', 9.99, 'candy', 'thetakeout.com'),
    P('Rubik’s Cube', 'The original 3x3', 'Walmart', 14.99, 'toy', 'walmart.com'),
    P('Netflix Standard Plan', '1 month, no ads', 'Netflix', 19.99, 'misc', 'Fox LA, March 2026 price increase'),
    P('Apple USB-C Cable', 'Woven charge cable, 1 m', 'Target', 19.99, 'tech', 'target.com'),
    P('Halloween Chocolate Bag', 'M&M’s, Snickers, Twix, Milky Way, 200 pieces', 'Walmart', 24.87, 'candy', 'walmart.com'),
    P('Lodge Cast Iron Skillet', '10.25 inch', 'Walmart', 24.90, 'home', 'walmart.com'),
    P('Pose-N-Stay Skeleton', '60 inch, 2026', 'Target', 25.00, 'halloween', 'corporate.target.com'),
    P('Apple AirTag', '1 AirTag, 2nd gen', 'Apple Store', 29.00, 'tech', 'appleinsider.com'),
    P('IKEA BLÅHAJ Shark', 'Soft toy, 39 inch', 'IKEA', 29.99, 'toy', 'ikea.com'),
    P('Catan Board Game', 'Base game, 6th edition', 'Target', 39.99, 'toy', 'shopsavvy.com'),
    P('LEGO Minecraft The Skeleton', 'Set 21594', 'LEGO', 39.99, 'toy', 'brickfanatics.com'),
    P('YETI Rambler Tumbler', '20 oz with MagSlider lid', 'Scheels', 40.00, 'home', 'scheels.com'),
    P('Stanley Quencher', '40 oz tumbler', 'Stanley', 45.00, 'home', 'stanley1913.com'),
    P('Crocs Classic Clog', 'Adult', 'Backcountry', 49.95, 'clothing', 'backcountry.com'),
    P('Amazon Echo Dot', '5th gen smart speaker, list price', 'Amazon', 49.99, 'tech', 'phonearena.com'),
    P('Fire TV Stick 4K Plus', 'With Alexa remote, list price', 'Amazon', 49.99, 'tech', 'aftvnews.com'),
    P('Costco Membership', 'Gold Star, 1 year', 'Costco', 65.00, 'misc', 'moneylion.com'),
    P('Apple Thunderbolt 5 Cable', 'USB-C, 1 m', 'Target', 69.99, 'tech', 'target.com'),
    P('Bloody Pennywise Costume', 'Adult', 'Spirit Halloween', 69.99, 'halloween', 'hauntedattractionnetwork.com'),
    P('Vans Old Skool', 'Black and white', 'Skate Warehouse', 74.95, 'clothing', 'skatewarehouse.com'),
    P('Mario Kart World', 'Nintendo Switch 2 game', 'Nintendo', 79.99, 'toy', 'shacknews.com'),
    P('Goodyear Blimp Costume', 'Adult inflatable', 'Spirit Halloween', 79.99, 'halloween', 'hauntedattractionnetwork.com'),
    P('LEGO Snoopy’s Doghouse', 'Peanuts set 21368', 'LEGO', 89.99, 'toy', 'brickfanatics.com'),
    P('Apple AirTag 4-Pack', '4 AirTags, 2nd gen', 'Apple Store', 99.00, 'tech', 'appleinsider.com')
  ];
})(window.IP = window.IP || {});
