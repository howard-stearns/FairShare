// Initial data and local storage setup

// Internally, amounts are in whole numbers (with costs rounded up), and fees taken as a floating point number (e.g., 12% is 0.12)
function roundUpToNearest(number, scale = 1) { // Rounds up to nearest whole value of scale.
  return Math.ceil(number * scale) / scale;
}
function roundDownToNearest(number, scale = 1) { // Rounds up to nearest whole value of scale.
  return Math.floor(number * scale) / scale;
}



class SharedObject { // Stateful object that are replicated among all who have access.
  static construct({name, key = this.name2key(name), ...properties}) { // Instantiate and record a subclass.
    return this.directory[key] = new this({name, ...properties}); // Each subclass must define it's own directory.
  }
  constructor(properties) {
    Object.assign(this, properties);
  }
  static get(key) {
    return this.directory[key];
  }
  static name2key(name) { // Default key given a name: camelCase it.
    return name.toLowerCase().replace(/[_\s\-]/g, '');
  }
}


class User extends SharedObject { // Represent a User
  static directory = {}; // Distinct from other SharedObjects.
}

/*
  Operations that might be involved in paying someone:
  - send amount to member: decrement user's balance by amount+fee; increment other member's balance by amount.
  - buy FairShare from group exchange, and in other group exchange that FairShare for group currency:
      from group:
         decrement user's balance by cost
         buy FairShare with it from exchange
	 issue fairshare coupon
       target group (not fairshare):
         redeem fairshare coupon, selling it for target currency (which could be slightly different than payment amount)
         increment target member's balance by amount
       target group is faishare:
	 redeem faishare coupon, adding it to group member's balance
  - send FairShare to target group's exchange, and in that group exchange it for group currency:
      from group (FairShare):
         decrement user's balance by exchange cost
         issue fairshare coupon
      target group:
        redeem fairshare coupon, selling it for target currency (which could be slight different than payment amount)
        increment target member's balance by amount
 */

class Group extends SharedObject { // Represent a group with currency, exchange, candidate and admitted members, etc.
  static directory = {}; // Distsinct from other SharedObjects.
  static list() {
    return Object.keys(this.directory);
  }
  computeTransferCost(amount) { // Apply the group fee to answer the cost for transfering amount within the group.
    return roundUpToNearest(amount * (1 + this.fee/100));
  }
  send(amount, fromMember, toMember) { // cost-amount is taken out of circulation
    const cost = this.computeTransferCost(amount); // Although the UI has just done this, we need to repeat to be secure.
    const senderData = this.people[fromMember];
    if (senderData.balance < cost) return false;
    senderData.balance -= cost;
    this.people[toMember].balance += amount;
    return true;
  }
  issueFairShareCertificate(fromAmount, fromMember, payee) {
    // We don't add to payee's balance in the FairShare group. Instead, redeeming the certificate will be
    // used in the exchange of another group.
    //
    // Although the UI has just computed costs, the computation is repeated here to be secure.
    const cost = (this === Group.get('fairshare')) ?
	  this.computeTransferCost(fromAmount) :
	  this.exchange.buyReserveCurrency(fromAmount);
    const senderData = this.people[fromMember];
    if (senderData.balance < cost) return false;
    senderData.balance -= cost;
    return {payee, amount:fromAmount};
  }
  redeemFairShareCertificate({payee, amount}) {
    const groupCoinCredit = this.exchange.sellReserveCurrency(amount);
    const payeeData = this.people[payee];
    if (!payeeData) return false;
    payeeData.balance += groupCoinCredit;
    return groupCoinCredit;
  }
  constructor({fee, totalGroupCoinReserve = 100e3, totalReserveCurrencyReserve = totalGroupCoinReserve, ...props}) {
    const exchange = new Exchange({totalGroupCoinReserve, totalReserveCurrencyReserve, fee: fee/100});
    super({exchange, fee, ...props});
  }
}

class Exchange { // Implements the math of Uniswap V1.
  constructor({totalGroupCoinReserve, totalReserveCurrencyReserve, fee = 0.003}) {
    Object.assign(this, {totalGroupCoinReserve, totalReserveCurrencyReserve, fee});
  }
  scale = 1;
  get scaledInverseFee() { return this.scale * (1 - this.fee); }
  computeSellAmount(inputAmount, inputReserve, outputReserve) { // To sell an inputAmount (of group or reserve currency), compute the amount of the other coin received.
    const numerator = inputAmount * outputReserve * this.scaledInverseFee;
    const denominator = inputReserve * this.scale + inputAmount * this.scaledInverseFee;
    const outputAmount = numerator / denominator;
    return roundDownToNearest(outputAmount, this.scale);
  }
  computeBuyAmount(outputAmount, inputReserve, outputReserve) { // To buy an outputAmount (of group or reserve currency), compute the cost in the other coin.
    const numerator = outputAmount * inputReserve * this.scale;
    const denominator = (outputReserve - outputAmount) * this.scaledInverseFee;
    // Note: In Uniswap v1, the following forumula has an additional +1, i.e., numerator / denominator + 1.
    // See https://github.com/Uniswap/docs/blob/main/docs/contracts/v1/guides/03-trade-tokens.md#amount-sold-buy-order
    // 1. That's not a constant k = x * y before and after the trade as advertized, and
    // 2. That's a buy order fee of input*0.003 + 1 instead of the advertized input*0.003.
    // It turns out that the +1 is trying to round up without costing too much "gas".
    // See https://www.reddit.com/r/UniSwap/comments/rjzkcj/why_does_it_have_add1_uniswapv2library_getamountin/
    // But, then, it's not clear to me why the formula in the spec for sell order outputAmount doesn't also have that:
    // https://github.com/Uniswap/docs/blob/main/docs/contracts/v1/guides/03-trade-tokens.md#amount-bought-sell-order
    // (Note that some of the latter sections on the same page are still designated as "comming soon":
    //  https://github.com/Uniswap/docs/blob/main/docs/contracts/v1/guides/03-trade-tokens.md#eth--erc20-trades)
    const inputAmount = numerator / denominator;
    return roundUpToNearest(inputAmount, this.scale);
  }
  reportTransaction({label, inputAmount, outputAmount, inputReserve, outputReserve, report=false}) {
    if (!report) return;
    const {totalReserveCurrencyReserve, totalGroupCoinReserve} = this;
    const fee = inputAmount * this.fee;
    const rate = outputAmount / inputAmount;
    const kBefore = inputReserve * outputReserve;
    const kAfter = totalReserveCurrencyReserve * totalGroupCoinReserve;
    console.log({label, inputAmount, outputAmount, fee, rate, inputReserve, outputReserve, totalReserveCurrencyReserve, totalGroupCoinReserve, kBefore, kAfter});
  }
  sellGroupCoin(amount) { // User sells amount of group currency to reserves, removing computed outputAmount of reserve currency from reserves.
    const inputAmount = amount;
    const inputReserve = this.totalGroupCoinReserve;
    const outputReserve = this.totalReserveCurrencyReserve;
    const outputAmount = this.computeSellAmount(inputAmount, inputReserve, outputReserve);
    this.totalGroupCoinReserve += inputAmount;
    this.totalReserveCurrencyReserve -= outputAmount;
    this.reportTransaction({label: 'sellGroupCoin', inputAmount, outputAmount, inputReserve, outputReserve});    
    return outputAmount;
  }
  sellReserveCurrency(amount) { // One can also sell the common trading coin (reserve currency) to the exchange.
    const inputAmount = amount;
    const inputReserve = this.totalReserveCurrencyReserve;
    const outputReserve = this.totalGroupCoinReserve;
    const outputAmount = this.computeSellAmount(inputAmount, inputReserve, outputReserve);
    this.totalGroupCoinReserve -= outputAmount;
    this.totalReserveCurrencyReserve += inputAmount;
    this.reportTransaction({label: 'sellPricingCoin', inputAmount, outputAmount, inputReserve, outputReserve});    
    return outputAmount;
  }
  buyGroupCoin(amount) { // User buys amount of group currency from exchange reserves, adding computed inputAmount of reserve currency to reserves.
    const outputAmount = amount;
    const outputReserve = this.totalGroupCoinReserve;
    const inputReserve = this.totalReserveCurrencyReserve;
    const inputAmount = this.computeBuyAmount(outputAmount, inputReserve, outputReserve);
    this.totalReserveCurrencyReserve += inputAmount;
    this.totalGroupCoinReserve -= outputAmount;
    this.reportTransaction({label: 'buyGroupCoin', inputAmount, outputAmount, inputReserve, outputReserve});
    return inputAmount;
  }
  buyReserveCurrency(amount) { // One can also buy the common trading coin (reserve currency) from the exchange
    const outputAmount = amount;
    const outputReserve = this.totalReserveCurrencyReserve;
    const inputReserve = this.totalGroupCoinReserve;
    const inputAmount = this.computeBuyAmount(outputAmount, inputReserve, outputReserve);
    this.totalReserveCurrencyReserve -= outputAmount;
    this.totalGroupCoinReserve += inputAmount;
    this.reportTransaction({label: 'buyPricingCoin', inputAmount, outputAmount, inputReserve, outputReserve});
    return inputAmount;
  }
}
/*
function testGroupCoinTrades({totalReserveCurrencyReserve = 100, totalGroupCoinReserve = 100, fee=0, nCycles=10}) {
  let exchange = new Exchange({totalReserveCurrencyReserve, totalGroupCoinReserve, fee});
  for (let i=0; i<nCycles; i++) {
    exchange.buyGroupCoin(1);
    exchange.sellGroupCoin(1);
  }
  let kBefore = totalReserveCurrencyReserve * totalGroupCoinReserve,
      kAfter = exchange.totalReserveCurrencyReserve * exchange.totalGroupCoinReserve;
  console.log(fee, kBefore / kAfter);
}
function testReserveCurrencyTrades({totalReserveCurrencyReserve = 100, totalGroupCoinReserve = 100, fee=0, nCycles=10}) {
  let exchange = new Exchange({totalReserveCurrencyReserve, totalGroupCoinReserve, fee});
  for (let i=0; i<nCycles; i++) {
    exchange.buyReserveCurrency(1);
    exchange.sellReserveCurrency(1);
  }
  let kBefore = totalReserveCurrencyReserve * totalGroupCoinReserve,
      kAfter = exchange.totalReserveCurrencyReserve * exchange.totalGroupCoinReserve;
  console.log(fee, kBefore / kAfter);
}

testGroupCoinTrades({});
testGroupCoinTrades({totalGroupCoinReserve: 10000});
testGroupCoinTrades({fee: 0.003});
testGroupCoinTrades({totalGroupCoinReserve: 10000, fee: 0.003});

testReserveCurrencyTrades({});
testReserveCurrencyTrades({totalGroupCoinReserve: 10000});
testReserveCurrencyTrades({fee: 0.003});
testReserveCurrencyTrades({totalGroupCoinReserve: 10000, fee: 0.003});
*/
/*
const inputAmount = 1;
const inputReserve = 1;
const outputReserve = 1;
const scale = 1;
const feeRate = 0;
const numerator = inputAmount * outputReserve * scale;
const denominator = inputReserve * scale + inputAmount * scale * (1-feeRate);
const outputAmount = numerator / denominator;
const fee = inputAmount * feeRate;
const rate = outputAmount / inputAmount;
const nextOutputReserve = outputReserve - outputAmount;
const nextInputReserve = inputReserve + inputAmount;
const reserveRatio = nextOutputReserve / nextInputReserve;
console.log({numerator, denominator, outputAmount, fee, rate, nextInputReserve, nextOutputReserve, reserveRatio});
*/

User.construct({ name: "Alice", img: "alice.jpeg" });
User.construct({ name: "Bob", img: "bob.png" });
User.construct({ name: "Carol" });
let localPersonas = ['alice', 'bob'];
Group.construct({ name: "Apples", fee: 1, stipend: 1, img: "apples.jpeg", people: { alice: {balance: 100}, bob: {balance: 200} }});
Group.construct({ name: "Bananas", fee: 2, stipend: 2, img: "bananas.jpeg", people: { bob: {balance: 300}, carol: {balance: 400} } });
Group.construct({ name: "Coconuts", fee: 3, stipend: 3, img: "coconuts.jpeg", people: { carol: {balance: 500}, alice: {balance: 600} } });
Group.construct({ name: "FairShare", fee: 2, stipend: 10, img: "fairshare.webp", people: { alice: {balance: 100}, bob: {balance: 100}, carol: {balance: 100} } });

/*
const testAmount = 20;
console.log(Group.get('apples').computeTransferFee(testAmount));
console.log(Group.get('fairshare').exchange.buyReserveCurrency(testAmount), Group.get('fairshare').exchange.buyGroupCoin(testAmount));
console.log(Group.get('fairshare').exchange.sellReserveCurrency(testAmount), Group.get('fairshare').exchange.sellGroupCoin(testAmount));
*/
