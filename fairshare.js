// The model behavior of Users and Groups (including Exchnges).
// These are the behaviors that would be shared over a network in a real app.
//
// There is a test suite that illustrates the use of these, at spec/fairshareSpec.js
// It can be run with: jasmine
// after installing with: npm install --global jasmine

// Internally, amounts are in whole numbers (with costs rounded up), and fees taken as a floating point number (e.g., 12% is 0.12)
function roundUpToNearest(number, unit = 1) { // Rounds up to nearest whole value of unit.
  return Math.ceil(number * unit) / unit;
}
function roundDownToNearest(number, unit = 1) { // Rounds up to nearest whole value of unit.
  return Math.floor(number * unit) / unit;
}


// There are two subclasses: User and Group, below.
class SharedObject { // Stateful object that are replicated among all who have access.
  static create({name, key = this.name2key(name), ...properties}) { // Instantiate and record a subclass.
    return this.directory[key] = new this({name, ...properties}); // Each subclass must define it's own directory.
  }
  constructor(properties) {
    Object.assign(this, properties);
  }
  static get(key) { // Answer the identified subclass instance, as recorded by contstruct({key}).
    return this.directory[key];
  }
  static name2key(name) { // Default key given a name: lowercase concatenated.
    return name.toLowerCase().replace(/[_\s\-]/g, '');
  }
}


class User extends SharedObject { // Represent a User (globally, not specificaly within a single Group).
  static directory = {}; // Distinct from other SharedObjects.
}

class Group extends SharedObject { // Represent a group with currency, exchange, candidate and admitted members, etc.
  static directory = {}; // Distsinct from other SharedObjects.
  static get list() { // List all the Groups.
    return Object.keys(this.directory);
  }
  constructor({fee, totalGroupCoinReserve = 100e3, totalReserveCurrencyReserve = totalGroupCoinReserve, ...props}) {
    const exchange = new Exchange({totalGroupCoinReserve, totalReserveCurrencyReserve, fee: fee/100});
    super({exchange, fee, ...props});
  }

  computeTransferCost(amount) { // Apply the group fee to answer the cost for transfering amount within the group.
    return roundUpToNearest(amount * (1 + this.fee/100));
  }
  computePurchaseCost(amount) { // How much FairShare is needed to exchange for amount of this group's currency.
    return this.exchange.computeBuyAmount(amount, this.exchange.totalReserveCurrencyReserve, this.exchange.totalGroupCoinReserve);
  }
  computeCertificateCost(amount) { // How much of this group's currency is needed to exchange for amount of FairShare.
    return this.exchange.computeBuyAmount(amount, this.exchange.totalGroupCoinReserve, this.exchange.totalReserveCurrencyReserve);
  }
    
  send(amount, fromMember, toMember) { // Atomically subtract cost fromMember and add amount toMember.
    const cost = this.computeTransferCost(amount); // Although the UI has just computed this, we need to repeat to be secure.
    const senderData = this.people[fromMember];
    if (senderData.balance < cost) return false;
    senderData.balance -= cost;
    this.people[toMember].balance += amount;
    return cost;
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
    const payeeData = this.people[payee];
    if (!payeeData) return false;
    const groupCoinCredit = (this === Group.get('fairshare')) ?
	  (amount - this.computeTransferCost(amount)) :
	  this.exchange.sellReserveCurrency(amount);
    payeeData.balance += groupCoinCredit;
    return groupCoinCredit;
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

User.create({ name: "Alice", img: "alice.jpeg" });
User.create({ name: "Bob", img: "bob.png" });
User.create({ name: "Carol" });
let localPersonas = ['alice', 'bob'];
Group.create({ name: "Apples", fee: 1, stipend: 1, img: "apples.jpeg", people: { alice: {balance: 100}, bob: {balance: 200} }});
Group.create({ name: "Bananas", fee: 2, stipend: 2, img: "bananas.jpeg", people: { bob: {balance: 300}, carol: {balance: 400} } });
Group.create({ name: "Coconuts", fee: 3, stipend: 3, img: "coconuts.jpeg", people: { carol: {balance: 500}, alice: {balance: 600} } });
Group.create({ name: "FairShare", fee: 2, stipend: 10, img: "fairshare.webp", people: { alice: {balance: 100}, bob: {balance: 100}, carol: {balance: 100} } });

/*
const testAmount = 20;
console.log(Group.get('apples').computeTransferFee(testAmount));
console.log(Group.get('fairshare').exchange.buyReserveCurrency(testAmount), Group.get('fairshare').exchange.buyGroupCoin(testAmount));
console.log(Group.get('fairshare').exchange.sellReserveCurrency(testAmount), Group.get('fairshare').exchange.sellGroupCoin(testAmount));
*/
// For unit testing in node.
module.exports = {roundUpToNearest, roundDownToNearest, User, Group};
